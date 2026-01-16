// PATH: projet_coeliaque_pwa.client/src/components/receipts/ReceiptImportSelectModal.tsx
import { useEffect, useMemo, useState } from "react";
import { Modal, Button, Form, Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import type { ReceiptImportedDetailsItem } from "./ReceiptImportedDetailsModal";

interface ReceiptImportSelectModalProps {
    show: boolean;
    items: ReceiptImportedDetailsItem[];
    onCancel: () => void;
    onConfirm: (selected: ReceiptImportedDetailsItem[]) => void;
}

interface LocalRow extends ReceiptImportedDetailsItem {
    _selected: boolean;
    _index: number;
}

export default function ReceiptImportSelectModal({
    show,
    items,
    onCancel,
    onConfirm,
}: ReceiptImportSelectModalProps) {
    const { t } = useTranslation("components/ReceiptImportSelectModal");

    const [rows, setRows] = useState<LocalRow[]>([]);

    useEffect(() => {
        if (!show) return;
        setRows(
            (items ?? []).map((it, idx) => ({
                ...it,
                _index: idx,
                _selected: true,
            }))
        );
    }, [items, show]);

    const anySelected = useMemo(
        () => rows.some((r) => r._selected),
        [rows]
    );

    const allSelected = useMemo(
        () => rows.length > 0 && rows.every((r) => r._selected),
        [rows]
    );

    const handleToggleRow = (index: number) => {
        setRows((prev) =>
            prev.map((r) =>
                r._index === index ? { ...r, _selected: !r._selected } : r
            )
        );
    };

    const handleToggleAll = () => {
        setRows((prev) => {
            if (prev.length === 0) return prev;
            const all = prev.every((r) => r._selected);
            return prev.map((r) => ({ ...r, _selected: !all }));
        });
    };

    const handleConfirm = () => {
        const selected = rows.filter((r) => r._selected);
        if (!selected.length) return;
        onConfirm(
            selected.map(({ _selected, _index, ...rest }) => rest)
        );
    };

    return (
        <Modal show={show} onHide={onCancel} centered>
            <Modal.Header closeButton>
                <Modal.Title>
                    <i className="bi bi-check2-square me-2" />
                    {t("title")}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <p className="text-muted small mb-2">{t("intro")}</p>

                {rows.length === 0 ? (
                    <div className="text-muted small">{t("empty")}</div>
                ) : (
                    <div className="table-responsive">
                        <Table
                            bordered
                            hover
                            size="sm"
                            className="align-middle mb-0"
                        >
                            <thead className="table-light text-center">
                                <tr>
                                    <th style={{ width: "3rem" }}>
                                        <Form.Check className="m-0 d-inline-flex justify-content-center">
                                            <Form.Check.Input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={handleToggleAll}
                                                aria-label={t(
                                                    "selectAllLabel"
                                                )}
                                            />
                                        </Form.Check>
                                    </th>
                                    <th>{t("table.article")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row._index}>
                                        <td className="text-center">
                                            <Form.Check className="m-0 d-inline-flex justify-content-center">
                                                <Form.Check.Input
                                                    type="checkbox"
                                                    checked={row._selected}
                                                    onChange={() =>
                                                        handleToggleRow(
                                                            row._index
                                                        )
                                                    }
                                                    aria-label={t(
                                                        "selectRowLabel"
                                                    )}
                                                />
                                            </Form.Check>
                                        </td>
                                        <td>{row.item}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </div>
                )}
            </Modal.Body>

            <Modal.Footer>
                <Button
                    variant="secondary"
                    className="rounded-pill px-4"
                    onClick={onCancel}
                >
                    {t("buttons.cancel")}
                </Button>
                <Button
                    variant="primary"
                    className="rounded-pill px-4"
                    onClick={handleConfirm}
                    disabled={!anySelected}
                >
                    {t("buttons.next")}
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
