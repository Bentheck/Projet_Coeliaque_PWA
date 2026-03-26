// PATH: projet_coeliaque_pwa.client/src/components/receipts/ReceiptImportModal.tsx
import { useState, useCallback } from "react";
import { Modal, Button, Form, Alert, Spinner, Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import {
    getUploadErrorMessage,
    prepareReceiptUploadFile,
} from "../../utils/receiptUpload";

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

    factureId: number;
    year: number;
    storeName: string;

    onItemsChosen: (items: ReceiptImportItem[]) => void;
}

// Shape we expect from /api/receipts/scan
interface ReceiptScanResponse {
    scanId?: number | string;
    items?: ReceiptImportItem[];
    // allow extra fields without typing them now
    [key: string]: any;
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
            prev.map((r) => (r._index === index ? { ...r, _selected: !r._selected } : r))
        );
    };

    const handleToggleAll = () => {
        setRows((prev) => {
            const allSelected = prev.length > 0 && prev.every((r) => r._selected);
            return prev.map((r) => ({ ...r, _selected: !allSelected }));
        });
    };

    const handleAnalyze = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);

        try {
            const uploadFile = await prepareReceiptUploadFile(file);
            const formData = new FormData();
            formData.append("file", uploadFile);
            formData.append("factureId", String(factureId));
            formData.append("year", String(year));
            formData.append("storeName", storeName ?? "");

            const res = await fetch("/api/receipts/scan", {
                method: "POST",
                body: formData,
                credentials: "include",
            });

            if (!res.ok) {
                throw new Error(
                    await getUploadErrorMessage(
                        res,
                        t("errors.receiptTooLarge")
                    )
                );
            }

            const json = (await res.json()) as ReceiptScanResponse;

            const items: ReceiptImportItem[] = Array.isArray(json.items) ? json.items : [];
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
            setError(err?.message ?? t("errors.generic"));
        } finally {
            setLoading(false);
        }
    };

    const handleApply = async () => {
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

        if (selected.length === 0) {
            return;
        }

        onItemsChosen(selected);
        resetState();
        onClose();
    };

    const hasRows = rows.length > 0;
    const anySelected = rows.some((r) => r._selected);

    return (
        <Modal
            show={show}
            onHide={handleHide}
            size="lg"
            centered
            contentClassName="receipt-import-modal"
        >
            <Modal.Header closeButton>
                <Modal.Title>
                    <i className="bi bi-camera me-2" />
                    {t("title")}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {error && (
                    <Alert variant="danger" className="mb-3">
                        {error}
                    </Alert>
                )}

                <Form.Group controlId="receipt-file" className="mb-3">
                    <Form.Label className="fw-semibold">{t("fields.fileLabel")}</Form.Label>
                    <Form.Control
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                    />
                    <Form.Text className="text-muted">
                        {t("fields.fileHelp")}
                    </Form.Text>
                </Form.Group>

                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div className="small text-muted">
                        {t("context.invoiceInfo", {
                            id: factureId,
                            store: storeName || t("context.unknownStore"),
                            year,
                        })}
                    </div>

                    <Button
                        variant="primary"
                        size="sm"
                        className="rounded-pill px-3"
                        onClick={handleAnalyze}
                        disabled={!file || loading}
                    >
                        {loading && (
                            <Spinner as="span" animation="border" size="sm" className="me-2" />
                        )}
                        <i className="bi bi-magic me-1" />
                        {t("buttons.analyze")}
                    </Button>
                </div>

                {hasRows && (
                    <>
                        <div className="mb-2 d-flex justify-content-between align-items-center">
                            <span className="fw-semibold">{t("preview.title")}</span>

                            <Button
                                variant="outline-secondary"
                                size="sm"
                                className="rounded-pill px-3"
                                onClick={handleToggleAll}
                            >
                                {t("buttons.toggleAll")}
                            </Button>
                        </div>

                        <div className="table-responsive">
                            <Table striped bordered hover size="sm" className="align-middle mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th style={{ width: "3rem" }} />
                                        <th>{t("table.item")}</th>
                                        <th style={{ width: "6rem" }}>{t("table.price")}</th>
                                        <th style={{ width: "5rem" }}>{t("table.qty")}</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row._index}>
                                            <td className="text-center">
                                                <Form.Check className="m-0 d-inline-flex justify-content-center">
                                                    <Form.Check.Input
                                                        type="checkbox"
                                                        className="receipt-import-checkbox"
                                                        checked={row._selected}
                                                        onChange={() => handleToggleRow(row._index)}
                                                        aria-label={t("table.selectRow")}
                                                    />
                                                </Form.Check>
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
                    <div className="text-muted small mt-3">{t("empty.hint")}</div>
                )}
            </Modal.Body>

            <Modal.Footer>
                <Button variant="secondary" className="rounded-pill px-4" onClick={handleHide}>
                    {t("buttons.cancel")}
                </Button>

                <Button
                    variant="success"
                    className="rounded-pill px-4"
                    onClick={handleApply}
                    disabled={!anySelected}
                >
                    <i className="bi bi-plus-circle me-2" />
                    {t("buttons.addSelected")}
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
