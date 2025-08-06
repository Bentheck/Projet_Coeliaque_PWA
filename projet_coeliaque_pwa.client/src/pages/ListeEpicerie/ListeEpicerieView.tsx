import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

// DTOs at the top of the file:
interface ListeEpicerieItemDto {
    factureItemId: number;
    quantity: number;
    isFavorite: boolean;
    // Optionally: factureItem?: { id: number; item: string; };
}

interface ListeEpicerieDto {
    id: number;
    name: string;
    created: string;
    items: ListeEpicerieItemDto[];
}

const ListeEpicerieView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [liste, setListe] = useState<ListeEpicerieDto | null>(null);

    useEffect(() => {
        fetch(`/api/ListeEpicerie/${id}`)
            .then(res => res.json())
            .then(setListe);
    }, [id]);

    if (!liste) return <div>Chargement...</div>;

    return (
        <div>
            <h1>{liste.name}</h1>
            <ul>
                {liste.items.map(item =>
                    <li key={item.factureItemId}>
                        Article ID: {item.factureItemId} (x{item.quantity}) {item.isFavorite && "★"}
                    </li>
                )}
            </ul>
            <button onClick={() => window.print()}>Imprimer</button>
        </div>
    );
};

export default ListeEpicerieView;
