import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface FactureItem {
    id: number;
    item: string;
    // Add any other needed properties
}

interface ListeEpicerieItemDto {
    factureItemId: number;
    quantity: number;
    isFavorite: boolean;
}

interface ListeEpicerieDto {
    id?: number;
    name: string;
    created?: string;
    items: ListeEpicerieItemDto[];
}

const ListeEpicerieEdit: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [liste, setListe] = useState<ListeEpicerieDto>({ name: "", items: [] });
    const [allItems, setAllItems] = useState<FactureItem[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetch("/api/factureitems")
            .then(res => res.json())
            .then(setAllItems);

        if (id) {
            fetch(`/api/ListeEpicerie/${id}`)
                .then(res => res.json())
                .then(setListe);
        }
    }, [id]);

    const addItem = (factureItemId: number) => {
        if (liste.items.some(item => item.factureItemId === factureItemId)) return;
        setListe(prev => ({
            ...prev,
            items: [...prev.items, { factureItemId, quantity: 1, isFavorite: false }]
        }));
    };

    const removeItem = (factureItemId: number) => {
        setListe(prev => ({
            ...prev,
            items: prev.items.filter(item => item.factureItemId !== factureItemId)
        }));
    };

    const updateItemQty = (factureItemId: number, quantity: number) => {
        setListe(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.factureItemId === factureItemId
                    ? { ...item, quantity }
                    : item
            )
        }));
    };

    const save = () => {
        const method = id ? "PUT" : "POST";
        const url = id ? `/api/ListeEpicerie/${id}` : "/api/ListeEpicerie";
        fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(liste)
        }).then(() => navigate("/liste-epicerie"));
    };

    return (
        <div>
            <input
                value={liste.name}
                onChange={e => setListe({ ...liste, name: e.target.value })}
                placeholder="Nom de la liste"
            />
            <h2>Articles dans la liste</h2>
            <ul>
                {liste.items.map(item =>
                    <li key={item.factureItemId}>
                        {allItems.find(i => i.id === item.factureItemId)?.item || "Article inconnu"}
                        {" "}
                        <input
                            type="number"
                            value={item.quantity}
                            min={1}
                            onChange={e => updateItemQty(item.factureItemId, parseInt(e.target.value) || 1)}
                            style={{ width: 50 }}
                        />
                        <button onClick={() => removeItem(item.factureItemId)}>Supprimer</button>
                    </li>
                )}
            </ul>
            <h2>Ajouter un article</h2>
            <ul>
                {allItems
                    .filter(i => !liste.items.some(li => li.factureItemId === i.id))
                    .map(i =>
                        <li key={i.id}>
                            {i.item}
                            <button onClick={() => addItem(i.id)}>Ajouter</button>
                        </li>
                    )}
            </ul>
            <button onClick={save}>Enregistrer</button>
        </div>
    );
};

export default ListeEpicerieEdit;
