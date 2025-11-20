import React, { useEffect, useState } from "react";
import Select, { type SingleValue } from "react-select";
import { Button, Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ComparatifYearDto, type ProductComparisonDto } from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";

const UNIT_OPTIONS = ["mg", "g", "kg", "lb", "oz", "ml", "l", "fl oz"];

const DemoComparatif: React.FC = () => {
    const { t } = useTranslation("pages/Comparatif/comparatifEdit");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Seed demo data on first load
    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                console.error(e);
                setError(e?.message ?? String(e));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Pick the latest comparatif year (our demo one)
    const year = useLiveQuery<ComparatifYearDto | undefined>(
        async () => db.comparatifYears.orderBy("annee").reverse().first(),
        []
    );

    const typeRow = useLiveQuery(
        () => (year ? db.comparatifTypes.get(year.annee) : Promise.resolve(undefined)),
        [year?.annee]
    ) as { annee: number; types: string[] } | undefined;

    const typeOptionsList: string[] = typeRow?.types ?? [];

    const [lines, setLines] = useState<ProductComparisonDto[]>([]);

    // Keep local copy in sync
    useEffect(() => {
        if (year?.lines) {
            setLines(year.lines.map((l) => ({ ...l })));
        }
    }, [year?.id, year?.annee, year?.lines]);

    const allowedTypeOptionsFor = (index: number) =>
        (typeOptionsList || []).filter(
            (opt) => !lines.some((l, j) => l.typeItem === opt && j !== index) || lines[index].typeItem === opt
        );

    function handleLineChange(idx: number, field: keyof ProductComparisonDto, value: any) {
        setLines((prev) => {
            const arr = [...prev];
            arr[idx] = { ...arr[idx], [field]: value };
            return arr;
        });
    }

    async function handleSave() {
        if (!year) return;
        try {
            const updated: ComparatifYearDto = { ...year, lines };
            await db.comparatifYears.put(updated);
            alert(t("demo.saveAlert"));
        } catch (e: any) {
            setError(e?.message ?? String(e));
        }
    }

    function addLine() {
        if (!year) return;
        const next: ProductComparisonDto = {
            id: -Date.now(),
            comparatifYearId: year.id,
            typeItem: "",
            marque: "",
            prix: 0,
            poidsValeur: 0,
            poidsUnite: "",
            magasin: "",
        } as any;
        setLines((prev) => [...prev, next]);
    }

    function deleteLine(idx: number) {
        if (!window.confirm(t("confirm.deleteLine"))) return;
        setLines((prev) => prev.filter((_, i) => i !== idx));
    }

    if (loading && !year) return <div className="container py-3">{t("loading")}</div>;
    if (error) return <div className="container py-3 alert alert-danger">{error}</div>;
    if (!year) return <div className="container py-3">{t("notFound")}</div>;

    return (
        <div className="container py-3">
            <div className="card shadow-sm rounded-4 mx-auto" style={{ maxWidth: 1200 }}>
                <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                        <h2 className="mb-0">
                            <i className="bi bi-sliders me-2"></i>
                            {t("header.title", { year: year.annee })}{" "}
                            <span className="badge bg-info ms-2">{t("demo.badge")}</span>
                        </h2>
                        <div className="d-flex gap-2">
                            <Button
                                variant="success"
                                size="sm"
                                className="rounded-pill px-3"
                                onClick={addLine}
                                type="button"
                            >
                                <i className="bi bi-plus-circle"></i> {t("actions.addLine")}
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                className="rounded-pill px-3"
                                onClick={handleSave}
                                type="button"
                            >
                                <i className="bi bi-save me-1" /> {t("btn.save")}
                            </Button>
                        </div>
                    </div>

                    {/* Demo warning banner */}
                    <div className="alert alert-warning small mb-3">
                        <i className="bi bi-exclamation-triangle-fill me-2" />
                        {t("demo.warning")}
                    </div>

                    {error && <div className="alert alert-danger">{error}</div>}

                    <Table bordered hover className="align-middle">
                        <thead className="table-light text-center">
                            <tr>
                                <th style={{ minWidth: 220 }}>{t("table.headers.type")}</th>
                                <th>{t("table.headers.brand")}</th>
                                <th style={{ width: 140 }}>{t("table.headers.price")}</th>
                                <th style={{ width: 160 }}>{t("table.headers.weight")}</th>
                                <th style={{ width: 140 }}>{t("table.headers.unit")}</th>
                                <th>{t("table.headers.store")}</th>
                                <th style={{ width: 90 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((item, i) => (
                                <tr key={item.id}>
                                    <td>
                                        <Select
                                            isClearable
                                            options={allowedTypeOptionsFor(i).map((v) => ({ label: v, value: v }))}
                                            value={item.typeItem ? { value: item.typeItem, label: item.typeItem } : null}
                                            onChange={(opt: SingleValue<{ label: string; value: string }>) =>
                                                handleLineChange(i, "typeItem", opt?.value || "")
                                            }
                                            placeholder={t("placeholders.type") as string}
                                            styles={{
                                                container: (base) => ({ ...base, minWidth: 0 }),
                                                menu: (base) => ({ ...base, zIndex: 9999 }),
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className="form-control border-black rounded-2"
                                            value={item.marque}
                                            onChange={(e) => handleLineChange(i, "marque", e.target.value)}
                                            placeholder={t("placeholders.brand") as string}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className="form-control border-black rounded-2"
                                            type="number"
                                            step="0.01"
                                            value={item.prix}
                                            onChange={(e) => handleLineChange(i, "prix", +e.target.value)}
                                            placeholder={t("placeholders.price") as string}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className="form-control border-black rounded-2"
                                            type="number"
                                            step="0.01"
                                            value={item.poidsValeur}
                                            onChange={(e) => handleLineChange(i, "poidsValeur", +e.target.value)}
                                            placeholder={t("placeholders.weight") as string}
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className="form-select border-black rounded-2"
                                            value={item.poidsUnite}
                                            onChange={(e) => handleLineChange(i, "poidsUnite", e.target.value)}
                                        >
                                            <option value="">{t("unit.placeholder")}</option>
                                            {UNIT_OPTIONS.map((u) => (
                                                <option key={u} value={u}>
                                                    {u}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <input
                                            className="form-control border-black rounded-2"
                                            value={item.magasin}
                                            onChange={(e) => handleLineChange(i, "magasin", e.target.value)}
                                            placeholder={t("placeholders.store") as string}
                                        />
                                    </td>
                                    <td className="text-center">
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                            onClick={() => deleteLine(i)}
                                            aria-label={t("delete.ariaLine") as string}
                                            title={t("delete.title") as string}
                                        >
                                            <i className="bi bi-x-lg"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </div>
            </div>
        </div>
    );
};

export default DemoComparatif;
