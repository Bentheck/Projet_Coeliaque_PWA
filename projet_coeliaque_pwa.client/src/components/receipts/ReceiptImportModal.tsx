// PATH: src/components/receipts/ReceiptImportModal.tsx
import { useState, useCallback } from "react";
import { Modal, Button, Form, Alert, Spinner, Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";

export interface ReceiptImportItem {
    id?: number;
    item: string;
    prix: number;
    quantite: number;
    typeItem?: string;
    poidsValeur?: number;
    poidsUnite?: string;
    wasOnSale?: boolean;
}

interface ReceiptImportModalProps {
    show: boolean;
    onClose: () => void;

    // Context about the current invoice
    factureId: number;
    year: number;
    storeName: string;

    // Called when user confirms the selection
    onItemsChosen: (items: ReceiptImportItem[]) => void;
}

interface LocalRow extends ReceiptImportItem {
    _index: number;
    _selected: boolean;
}

export default function ReceiptImportModal({
    show,
    onClose,
    factureId,
    year,
    storeName,
    onItemsChosen,
}: ReceiptImportModalProps) {
    const { t } = useTranslation("components/ReceiptImportModal");

    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<LocalRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resetState = useCallback(() => {
        setFile(null);
        setRows([]);
        setLoading(false);
        setError(null);
    }, []);

    const handleHide = () => {
        resetState();
        onClose();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) {
            setFile(null);
            return;
        }
        setFile(files[0]);
    };

    const handleToggleRow = (index: number) => {
        setRows((prev) =>
            prev.map((r) =>
                r._index === index ? { ...r, _selected: !r._selected } : r
            )
        );
    };

    const handleToggleAll = () => {
        setRows((prev) => {
            const allSelected = prev.every((r) => r._selected);
            return prev.map((r) => ({ ...r, _selected: !allSelected }));
        });
    };

    const handleAnalyze = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("factureId", String(factureId));
            formData.append("year", String(year));
            formData.append("storeName", storeName ?? "");

            // NOTE: endpoint name is tentative; you will add the controller later.
            const res = await fetch("/api/receipts/scan", {
                method: "POST",
                body: formData,
                credentials: "include",
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `HTTP ${res.status}`);
            }

            // Expected shape: { items: ReceiptImportItem[] }
            const json = await res.json();
            const items: ReceiptImportItem[] = Array.isArray(json.items)
                ? json.items
                : [];

            const withLocal: LocalRow[] = items.map((it, idx) => ({
                _index: idx,
                _selected: true,
                id: 0,
                item: it.item ?? "",
                prix: it.prix ?? 0,
                quantite: it.quantite ?? 1,
                typeItem: it.typeItem ?? "",
                poidsValeur: it.poidsValeur ?? 0,
                poidsUnite: it.poidsUnite ?? "",
                wasOnSale: !!it.wasOnSale,
            }));

            setRows(withLocal);
        } catch (err: any) {
            setError(
                err?.message ??
                t("errors.generic", "Une erreur est survenue.")
            );
        } finally {
            setLoading(false);
        }
    };

    const handleApply = () => {
        const selected = rows
            .filter((r) => r._selected)
            .map<ReceiptImportItem>((r) => ({
                id: 0,
                item: r.item,
                prix: r.prix,
                quantite: r.quantite,
                typeItem: r.typeItem,
                poidsValeur: r.poidsValeur,
                poidsUnite: r.poidsUnite,
                wasOnSale: r.wasOnSale,
            }));

        if (selected.length > 0) {
            onItemsChosen(selected);
        }

        resetState();
        onClose();
    };

    const hasRows = rows.length > 0;
    const anySelected = rows.some((r) => r._selected);

    return (
        <Modal show={show} onHide={handleHide} size="lg" centered>
            <Modal.Header closeButton>
                <Modal.Title>
                    <i className="bi bi-camera me-2" />
                    {t("title", "Importer à partir d’un reçu")}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {error && (
                    <Alert variant="danger" className="mb-3">
                        {error}
                    </Alert>
                )}

                <Form.Group controlId="receipt-file" className="mb-3">
                    <Form.Label className="fw-semibold">
                        {t(
                            "fields.fileLabel",
                            "Sélectionnez une photo ou un scan du reçu"
                        )}
                    </Form.Label>
                    <Form.Control
                        type="file"
                        accept="image/*,.pdf"
                        capture="environment"
                        onChange={handleFileChange}
                    />
                    <Form.Text className="text-muted">
                        {t(
                            "fields.fileHelp",
                            "Les photos claires et bien cadrées donnent de meilleurs résultats."
                        )}
                    </Form.Text>
                </Form.Group>

                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div className="small text-muted">
                        {t(
                            "context.invoiceInfo",
                            "Facture #{{id}} — {{store}} ({{year}})",
                            {
                                id: factureId,
                                store: storeName || t("context.unknownStore", "Magasin inconnu"),
                                year,
                            }
                        )}
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        className="rounded-pill px-3"
                        onClick={handleAnalyze}
                        disabled={!file || loading}
                    >
                        {loading && (
                            <Spinner
                                as="span"
                                animation="border"
                                size="sm"
                                className="me-2"
                            />
                        )}
                        <i className="bi bi-magic me-1" />
                        {t("buttons.analyze", "Analyser le reçu")}
                    </Button>
                </div>

                {hasRows && (
                    <>
                        <div className="mb-2 d-flex justify-content-between align-items-center">
                            <span className="fw-semibold">
                                {t(
                                    "preview.title",
                                    "Articles détectés sur le reçu"
                                )}
                            </span>
                            <Button
                                variant="outline-secondary"
                                size="sm"
                                className="rounded-pill px-3"
                                onClick={handleToggleAll}
                            >
                                {t("buttons.toggleAll", "Tout cocher / décocher")}
                            </Button>
                        </div>

                        <div className="table-responsive">
                            <Table
                                striped
                                bordered
                                hover
                                size="sm"
                                className="align-middle mb-0"
                            >
                                <thead className="table-light">
                                    <tr>
                                        <th style={{ width: "3rem" }} />
                                        <th>{t("table.item", "Article")}</th>
                                        <th style={{ width: "6rem" }}>
                                            {t("table.price", "Prix")}
                                        </th>
                                        <th style={{ width: "5rem" }}>
                                            {t("table.qty", "Qté")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row._index}>
                                            <td className="text-center">
                                                <Form.Check
                                                    type="checkbox"
                                                    checked={row._selected}
                                                    onChange={() =>
                                                        handleToggleRow(row._index)
                                                    }
                                                />
                                            </td>
                                            <td>{row.item}</td>
                                            <td>{row.prix.toFixed(2)}</td>
                                            <td>{row.quantite}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </div>
                    </>
                )}

                {!hasRows && !loading && (
                    <div className="text-muted small mt-3">
                        {t(
                            "empty.hint",
                            "Choisissez un fichier, puis cliquez sur « Analyser le reçu » pour extraire les articles."
                        )}
                    </div>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    variant="secondary"
                    className="rounded-pill px-4"
                    onClick={handleHide}
                >
                    {t("buttons.cancel", "Annuler")}
                </Button>
                <Button
                    variant="success"
                    className="rounded-pill px-4"
                    onClick={handleApply}
                    disabled={!anySelected}
                >
                    <i className="bi bi-plus-circle me-2" />
                    {t(
                        "buttons.addSelected",
                        "Ajouter les articles sélectionnés"
                    )}
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
