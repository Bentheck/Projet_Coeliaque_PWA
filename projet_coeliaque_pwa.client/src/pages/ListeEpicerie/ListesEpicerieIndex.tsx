import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface ListeEpicerieDTO {
    id: number;
    name: string;
    created: string;
    items: any[]; // You can type this if you want, e.g. ListeEpicerieItemDto[]
}

const ListesEpicerieIndex: React.FC = () => {
    const [listes, setListes] = useState<ListeEpicerieDTO[]>([]);

    useEffect(() => {
        fetch("/api/ListeEpicerie")
            .then(res => res.json())
            .then(setListes);
    }, []);

    return (
        <div>
            <h1>Mes listes d&apos;épicerie</h1>
            <Link to="/liste-epicerie/edit">Nouvelle liste</Link>
            <ul>
                {listes.map(l =>
                    <li key={l.id}>
                        <Link to={`/liste-epicerie/view/${l.id}`}>{l.name}</Link>{" "}
                        <Link to={`/liste-epicerie/edit/${l.id}`}>Éditer</Link>
                    </li>
                )}
            </ul>
        </div>
    );
};

export default ListesEpicerieIndex;
