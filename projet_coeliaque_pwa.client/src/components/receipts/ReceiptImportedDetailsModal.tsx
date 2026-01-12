// PATH: projet_coeliaque_pwa.client/src/components/receipts/ReceiptImportedDetailsModal.tsx
import { useEffect, useMemo, useState } from "react";
import { Modal, Button, Form, Table } from "react-bootstrap";
import CreatableSelect from "react-select/creatable";
import type { SingleValue } from "react-select";
import { useTranslation } from "react-i18next";

export interface ReceiptImportedDetailsItem {
    id?: number;
    item: string;
    typeItem: string;
    quantite: number;
    prix: number;
    poidsValeur: number;
    poidsUnite: string;
    wasOnSale: boolean;
}

interface TypeOption {
    label: string;
    value: string;
}

interface ReceiptImportedDetailsModalProps {
    show: boolean;
    items: ReceiptImportedDetailsItem[];
    typeOptions: TypeOption[];
    unitOptions: string[];
    unitLabel: (code: string) => string;
    onCancel: () => void;
    onConfirm: (items: ReceiptImportedDetailsItem[]) => void;
}

export default function ReceiptImportedDetailsModal({
    show,
    items,
    typeOptions,
    unitOptions,
    unitLabel,
    onCancel,
    onConfirm,
}: ReceiptImportedDetailsModalProps) {
    const { t } = useTranslation("components/ReceiptImportedDetailsModal");

    const [localItems, setLocalItems] = useState<ReceiptImportedDetailsItem[]>(items ?? []);

    useEffect(() => {
        setLocalItems(items ?? []);
    }, [items, show]);

    const handleItemFieldChange = (
        index: number,
        field: keyof ReceiptImportedDetailsItem,
        value: any
    ) => {
        setLocalItems((prev) => {
            const next = [...prev];
            const current = { ...next[index] };
            (current as any)[field] = value;
            next[index] = current;
            return next;
        });
    };

    const handleTypeChange = (
        index: number,
        option: SingleValue<{ label: string; value: string }>
    ) => {
        handleItemFieldChange(index, "typeItem", option?.value || "");
    };

    const isRowValid = (row: ReceiptImportedDetailsItem) => {
        const hasItem = (row.item || "").trim().length > 0;
        const hasType = (row.typeItem || "").trim().length > 0;
        const hasUnit = (row.poidsUnite || "").trim().length > 0;
        const hasWeight = row.poidsValeur > 0;
        return hasItem && hasType && hasUnit && hasWeight;
    };

    const canConfirm = useMemo(() => {
        if (!localItems || localItems.length === 0) return false;
        return localItems.every(isRowValid);
    }, [localItems]);

    const handleConfirmClick = () => {
        if (!canConfirm) return;
        onConfirm(localItems);
    };

    return (
        <Modal
            show={show}
            onHide={onCancel}
            centered
            scrollable
            size="xl"
            dialogClassName="receipt-imported-details-dialog"
            contentClassName="receipt-imported-details-modal"
        >
            <Modal.Header closeButton>
                <Modal.Title>
                    <i className="bi bi-list-check me-2" />
                    {t("title")}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <p className="text-muted small mb-3">{t("intro")}</p>

                {localItems.length === 0 ? (
                    <div className="text-muted">{t("empty")}</div>
                ) : (
                    <div className="table-responsive receipt-imported-details-tablewrap">
                        <Table bordered hover size="sm" className="align-middle mb-0">
                            <thead className="table-light text-center">
                                <tr>
                                    <th style={{ minWidth: "220px" }}>{t("table.article")}</th>
                                    <th style={{ minWidth: "260px" }}>{t("table.typeProduit")}</th>
                                    <th style={{ width: "6.5rem" }}>{t("table.quantite")}</th>
                                    <th style={{ width: "7rem" }}>{t("table.prix")}</th>
                                    <th style={{ width: "8rem" }}>{t("table.poids")}</th>
                                    <th style={{ width: "9.5rem" }}>{t("table.unite")}</th>
                                    <th style={{ width: "8.5rem" }}>{t("table.enSoldeQ")}</th>
                                </tr>
                            </thead>

                            <tbody>
                                {localItems.map((row, index) => {
                                    const rowValid = isRowValid(row);

                                    return (
                                        <tr key={index}>
                                            {/* Article */}
                                            <td>
                                                <Form.Control
                                                    type="text"
                                                    value={row.item}
                                                    onChange={(e) =>
                                                        handleItemFieldChange(index, "item", e.target.value)
                                                    }
                                                    placeholder={t("placeholders.article")}
                                                    isInvalid={!rowValid && !row.item.trim()}
                                                />
                                            </td>

                                            {/* Type de produit */}
                                            <td>
                                                <CreatableSelect
                                                    isClearable
                                                    options={typeOptions}
                                                    value={
                                                        row.typeItem
                                                            ? { value: row.typeItem, label: row.typeItem }
                                                            : null
                                                    }
                                                    onChange={(opt) => handleTypeChange(index, opt)}
                                                    placeholder={t("placeholders.typeProduit") as string}
                                                    classNamePrefix="receipt-import-type"
                                                    menuPortalTarget={document.body}
                                                    menuPosition="fixed"
                                                    styles={{
                                                        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                                    }}
                                                />
                                            </td>

                                            {/* Quantité */}
                                            <td>
                                                <Form.Control
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={row.quantite}
                                                    onChange={(e) =>
                                                        handleItemFieldChange(
                                                            index,
                                                            "quantite",
                                                            Number(e.target.value) || 0
                                                        )
                                                    }
                                                />
                                            </td>

                                            {/* Prix */}
                                            <td>
                                                <Form.Control
                                                    type="number"
                                                    step="0.01"
                                                    min={0}
                                                    value={row.prix}
                                                    onChange={(e) =>
                                                        handleItemFieldChange(index, "prix", Number(e.target.value) || 0)
                                                    }
                                                />
                                            </td>

                                            {/* Poids */}
                                            <td>
                                                <Form.Control
                                                    type="number"
                                                    step="0.01"
                                                    min={0}
                                                    value={row.poidsValeur}
                                                    onChange={(e) =>
                                                        handleItemFieldChange(
                                                            index,
                                                            "poidsValeur",
                                                            Number(e.target.value) || 0
                                                        )
                                                    }
                                                    isInvalid={!rowValid && !(row.poidsValeur > 0)}
                                                />
                                            </td>

                                            {/* Unité */}
                                            <td>
                                                <Form.Select
                                                    value={row.poidsUnite}
                                                    onChange={(e) =>
                                                        handleItemFieldChange(index, "poidsUnite", e.target.value)
                                                    }
                                                    isInvalid={!rowValid && !row.poidsUnite.trim()}
                                                >
                                                    <option value="">{t("placeholders.unitFallback")}</option>
                                                    {unitOptions.map((u) => (
                                                        <option key={u} value={u}>
                                                            {unitLabel(u)}
                                                        </option>
                                                    ))}
                                                </Form.Select>
                                            </td>

                                            {/* En solde ? */}
                                            <td className="text-center">
                                                <Form.Check className="m-0 d-inline-flex justify-content-center">
                                                    <Form.Check.Input
                                                        type="checkbox"
                                                        className="receipt-imported-details-checkbox"
                                                        checked={row.wasOnSale}
                                                        onChange={(e) =>
                                                            handleItemFieldChange(index, "wasOnSale", e.target.checked)
                                                        }
                                                        aria-label={t("table.enSoldeQ")}
                                                    />
                                                </Form.Check>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </div>
                )}
            </Modal.Body>

            <Modal.Footer>
                <Button variant="secondary" className="rounded-pill px-4" onClick={onCancel}>
                    {t("buttons.cancel")}
                </Button>

                <Button
                    variant="success"
                    className="rounded-pill px-4"
                    onClick={handleConfirmClick}
                    disabled={!canConfirm}
                >
                    <i className="bi bi-check-circle me-2" />
                    {t("buttons.apply")}
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
