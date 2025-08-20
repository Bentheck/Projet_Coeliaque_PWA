import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface ProductComparisonRow {
    typeItem: string;
    nomSansGluten: string;
    quantiteSansGluten: number;
    formatSansGluten: number;
    uniteSansGluten: string;
    prixSansGluten: number;

    marqueAvecGluten?: string | null;
    nomAvecGluten?: string | null;
    formatAvecGluten?: number | null;
    uniteAvecGluten?: string | null;
    prixAvecGluten?: number | null;

    prixPar100SansGluten: number;
    prixPar100AvecGluten: number;
    diffPar100: number;
    sousTotalProduit: number;
    prixPar100Unit: string;
}

const RapportsDisplay: React.FC = () => {
    const { annee } = useParams<{ annee: string }>();
    const [rows, setRows] = useState<ProductComparisonRow[]>([]);
    const [total, setTotal] = useState(0);
    const [userName, setUserName] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const printSectionRef = useRef<HTMLDivElement>(null);

    // State for modal prompt
    const [showPrompt, setShowPrompt] = useState(false);
    const [printNom, setPrintNom] = useState("");
    const [printNAS, setPrintNAS] = useState("");
    const [triggerPrint, setTriggerPrint] = useState(false);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/rapports/${annee}`, { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(data => {
                setRows(data.reportRows || []);
                setTotal(data.totalSousTotalProduit || 0);
                setUserName(data.userName || "");
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [annee]);

    // When triggerPrint is set, print and then reset fields
    useEffect(() => {
        if (!triggerPrint) return;
        setTimeout(() => {
            window.print();
            setShowPrompt(false);
            setTriggerPrint(false);
            // Optionally clear fields after print:
            // setPrintNom("");
            // setPrintNAS("");
        }, 200); // Short delay to ensure DOM updates
    }, [triggerPrint]);

    function handlePrintClick() {
        setShowPrompt(true);
    }

    function handlePromptSubmit(e: React.FormEvent) {
        e.preventDefault();
        setShowPrompt(false);
        setTriggerPrint(true);
    }

    if (loading) return <div>Chargement…</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    return (
        <div className="container py-3" style={{ maxWidth: 1200 }}>
            {/* INFO ALERT (not printed) */}
            <div className="alert alert-info no-print mb-3" style={{ fontSize: "1.06em" }}>
                <i className="bi bi-info-circle me-2"></i>
                <b>Note :</b> Lorsque vous cliquerez sur “Imprimer”, vous pourrez entrer votre <b><i>NOM</i></b> et votre <b><i>NAS</i></b> pour qu’ils soient inclus en haut du rapport. <b><i>Ceux-ci ne seront pas sauvegardés.</i></b>
            </div>
            <button className="btn btn-success no-print mb-3" onClick={handlePrintClick}>
                Télécharger/Imprimer le PDF
            </button>
            <button className="btn btn-outline-secondary no-print mb-3 ms-2" onClick={() => navigate(-1)}>
                Retour
            </button>
            {/* Prompt Modal */}
            {showPrompt && (
                <div
                    style={{
                        position: "fixed",
                        top: 0, left: 0, right: 0, bottom: 0,
                        zIndex: 9999,
                        background: "rgba(0,0,0,0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}>
                    <form
                        onSubmit={handlePromptSubmit}
                        autoComplete="off"
                        style={{
                            background: "#fff",
                            borderRadius: 12,
                            padding: 32,
                            minWidth: 350,
                            boxShadow: "0 4px 30px rgba(0,0,0,0.17)"
                        }}
                    >
                        <h4 className="mb-4">Informations à inclure dans le rapport</h4>
                        <div className="alert alert-primary" style={{ fontSize: "1em" }}>
                            Vous pouvez laisser ces champs vides si vous préférez écrire à la main sur le PDF imprimé.
                        </div>
                        <div className="mb-3">
                            <label className="form-label fw-bold">Nom :</label>
                            <input
                                className="form-control"
                                type="text"
                                value={printNom}
                                onChange={e => setPrintNom(e.target.value)}
                                placeholder="Votre nom"
                                maxLength={80}
                                autoFocus
                                autoComplete="off"
                                name="no-autofill-nom"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="form-label fw-bold">NAS :</label>
                            <input
                                className="form-control"
                                type="text"
                                value={printNAS}
                                onChange={e => setPrintNAS(e.target.value)}
                                placeholder="XXX XXX XXX"
                                maxLength={20}
                                autoComplete="off"
                                name="no-autofill-nas"
                            />
                        </div>
                        <div className="d-flex justify-content-end gap-2">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowPrompt(false)}
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                className="btn btn-success"
                            >
                                Continuer et imprimer
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div id="print-section" ref={printSectionRef}>
                {/* Print-only CSS */}
                <style>
                    {`
                    @media screen {
                        .print-only { display: none !important; }
                    }
                    @media print {
                        .print-only { display: flex !important; }
                        .no-print { display: none !important; }
                    }
                    `}
                </style>
                {/* PRINT: Nom & NAS boxes (always shown in print, and on screen for preview) */}
                <div className="d-flex gap-4 align-items-end mb-4 mt-2 print-only" style={{ marginTop: 18 }}>
                    <div>
                        <div style={{
                            fontWeight: "bold",
                            marginBottom: 6,
                            fontSize: "1.07em"
                        }}>Nom&nbsp;:</div>
                        <div style={{
                            border: "2px solid #333",
                            background: "#fff",
                            width: 260,
                            height: 36,
                            marginBottom: 6,
                            display: "flex",
                            alignItems: "center",
                            fontSize: "1.07em",
                            paddingLeft: 10
                        }}>
                            {printNom || <span style={{ color: "#fff" }}>-</span>}
                        </div>
                    </div>
                    <div>
                        <div style={{
                            fontWeight: "bold",
                            marginBottom: 6,
                            fontSize: "1.07em"
                        }}>NAS&nbsp;:</div>
                        <div style={{
                            border: "2px solid #333",
                            background: "#fff",
                            width: 180,
                            height: 36,
                            marginBottom: 6,
                            display: "flex",
                            alignItems: "center",
                            fontSize: "1.07em",
                            paddingLeft: 10
                        }}>
                            {printNAS || <span style={{ color: "#fff" }}>-</span>}
                        </div>
                    </div>
                </div>
                <h1>Rapport Comparatif Année {annee}</h1>
                <p>Utilisateur: {userName}</p>
                <table className="comparatif-table">
                    <thead>
                        <tr>
                            <th colSpan={7} className="comparatif-header-sg double-divider">PRODUIT SANS GLUTEN</th>
                            <th colSpan={6} className="comparatif-header-ag double-divider">PRODUIT COMPARATIF AVEC GLUTEN</th>
                            <th colSpan={3} className="comparatif-header-total"></th>
                        </tr>
                        <tr>
                            <th className="comparatif-th-sg">Type Item</th>
                            <th className="comparatif-th-sg">Nom Sans Gluten</th>
                            <th className="comparatif-th-sg">Quantité</th>
                            <th className="comparatif-th-sg">Format</th>
                            <th className="comparatif-th-sg">Unité</th>
                            <th className="comparatif-th-sg">Prix Sans Gluten</th>
                            <th className="comparatif-th-sg double-divider">Prix/100g-100ml-Unité Sans Gluten</th>
                            <th className="comparatif-th-ag">Marque Avec Gluten</th>
                            <th className="comparatif-th-ag">Nom Avec Gluten</th>
                            <th className="comparatif-th-ag">Format</th>
                            <th className="comparatif-th-ag">Unité</th>
                            <th className="comparatif-th-ag">Prix Avec Gluten</th>
                            <th className="comparatif-th-ag double-divider">Prix/100g-100ml-Unité Avec Gluten</th>
                            <th>Différence par 100g/100ml/unité</th>
                            <th>Sous-total produit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i}>
                                <td className="comparatif-th-sg">{row.typeItem}</td>
                                <td className="comparatif-th-sg">{row.nomSansGluten}</td>
                                <td className="comparatif-th-sg">{row.quantiteSansGluten}</td>
                                <td className="comparatif-th-sg">{row.formatSansGluten}</td>
                                <td className="comparatif-th-sg">{row.uniteSansGluten}</td>
                                <td className="comparatif-th-sg">{row.prixSansGluten.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</td>
                                <td className="comparatif-th-sg double-divider">{row.prixPar100SansGluten.toFixed(3)} {row.prixPar100Unit}</td>
                                <td className="comparatif-th-ag">{row.marqueAvecGluten ?? ""}</td>
                                <td className="comparatif-th-ag">{row.nomAvecGluten ?? ""}</td>
                                <td className="comparatif-th-ag">{row.formatAvecGluten ?? ""}</td>
                                <td className="comparatif-th-ag">{row.uniteAvecGluten ?? ""}</td>
                                <td className="comparatif-th-ag">{(row.prixAvecGluten ?? 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</td>
                                <td className="comparatif-th-ag double-divider">{row.prixPar100AvecGluten.toFixed(3)} {row.prixPar100Unit}</td>
                                <td>{row.diffPar100.toFixed(3)} {row.prixPar100Unit}</td>
                                <td>{row.sousTotalProduit.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ marginTop: 32, fontSize: "1.1em" }}>
                    <b>TOTAL = {total.toFixed(2)} $</b>
                </div>
                <div className="mt-5 p-4 rounded-3 bg-light border" style={{ fontSize: "1em", maxWidth: 900 }}>
                    <h4 className="fw-bold mb-2"><i className="bi bi-calculator me-2"></i>Explications des calculs</h4>
                    <ul>
                        <li>
                            <b>Prix/100 (Sans Gluten ou Avec Gluten):</b>
                            <br />
                            <span>
                                <code>Prix / Poids × 100</code> <br />
                                Exemple : Pour un produit de 2,99 $ pour 500 g, le prix par 100 g = <b>2,99 / 500 × 100 = 0,60 $</b>
                            </span>
                        </li>
                        <li className="mt-2">
                            <b>Différence par 100 (Diff/100):</b>
                            <br />
                            <span>
                                <code>Prix/100 Sans Gluten – Prix/100 Avec Gluten</code><br />
                                (Représente le coût supplémentaire du produit sans gluten par rapport au produit avec gluten, pour une même quantité.)
                            </span>
                        </li>
                        <li className="mt-2">
                            <b>Sous-total produit:</b>
                            <br />
                            <span>
                                <code>Différence par 100 × Quantité totale achetée (exprimée en 100g/100ml/unité selon le format)</code><br />
                                Exemple : Si la différence est 0,60 $ par 100g et vous avez acheté 2 kg (soit 2000g), alors : <br />
                                <b>0,60 × (2000/100) = 0,60 × 20 = 12,00 $</b>
                            </span>
                        </li>
                        <li className="mt-2">
                            <b>TOTAL :</b> Somme de tous les sous-totaux produits. Il s’agit du montant total admissible au remboursement.
                        </li>
                    </ul>
                    <div className="mt-2 text-secondary" style={{ fontSize: "0.95em" }}>
                        <i>
                            Les conversions d’unités (kg, lb, ml, etc.) sont automatiquement prises en compte pour garantir des comparaisons équitables.
                        </i>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RapportsDisplay;
