// PATH: projet_coeliaque_pwa.client/src/components/receipts/ReceiptViewerModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Button, Spinner, Alert } from "react-bootstrap";

export interface ReceiptViewerModalProps {
    show: boolean;
    onClose: () => void;
    imageUrl: string;
    fileName?: string | null;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export default function ReceiptViewerModal({
    show,
    onClose,
    imageUrl,
    fileName,
}: ReceiptViewerModalProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 6;
    const STEP = 0.25;

    const [zoom, setZoom] = useState(1);
    const [imgLoading, setImgLoading] = useState(true);
    const [imgError, setImgError] = useState<string | null>(null);

    const zoomPct = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

    // Reset state when opened or when image changes
    useEffect(() => {
        if (!show) return;
        setZoom(1);
        setImgLoading(true);
        setImgError(null);
        requestAnimationFrame(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = 0;
                scrollRef.current.scrollLeft = 0;
            }
        });
    }, [show, imageUrl]);

    const zoomIn = () => setZoom((z) => clamp(Number((z + STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
    const zoomOut = () => setZoom((z) => clamp(Number((z - STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
    const resetZoom = () => setZoom(1);

    // Keyboard shortcuts while modal is open
    useEffect(() => {
        if (!show) return;

        const onKeyDown = (e: KeyboardEvent) => {
            // Don't steal keys from inputs
            const tag = (e.target as any)?.tagName?.toLowerCase?.() ?? "";
            if (tag === "input" || tag === "textarea" || tag === "select") return;

            if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                zoomIn();
            } else if (e.key === "-" || e.key === "_") {
                e.preventDefault();
                zoomOut();
            } else if (e.key === "0") {
                e.preventDefault();
                resetZoom();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    const title = fileName?.trim() ? fileName.trim() : "Receipt";

    return (
        <Modal
            show={show}
            onHide={onClose}
            centered
            size="xl"
            dialogClassName="receipt-viewer-modal"
            contentClassName="receipt-viewer-modal__content"
        >
            <Modal.Header closeButton>
                <Modal.Title className="d-flex align-items-center gap-2">
                    <i className="bi bi-image" />
                    <span className="text-truncate" style={{ maxWidth: "65vw" }} title={title}>
                        {title}
                    </span>
                </Modal.Title>
            </Modal.Header>

            <Modal.Body className="pt-2">
                {/* Toolbar */}
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                    <div className="d-flex align-items-center gap-2">
                        <Button
                            variant="outline-secondary"
                            className="rounded-pill px-3"
                            onClick={zoomOut}
                            disabled={zoom <= MIN_ZOOM}
                            aria-label="Zoom out"
                            title="Zoom out (-)"
                        >
                            <i className="bi bi-zoom-out me-2" />
                            -
                        </Button>

                        <Button
                            variant="outline-secondary"
                            className="rounded-pill px-3"
                            onClick={zoomIn}
                            disabled={zoom >= MAX_ZOOM}
                            aria-label="Zoom in"
                            title="Zoom in (+)"
                        >
                            <i className="bi bi-zoom-in me-2" />
                            +
                        </Button>

                        <Button
                            variant="outline-secondary"
                            className="rounded-pill px-3"
                            onClick={resetZoom}
                            disabled={zoom === 1}
                            aria-label="Reset zoom"
                            title="Reset zoom (0)"
                        >
                            <i className="bi bi-arrow-counterclockwise me-2" />
                            Reset
                        </Button>

                        <span className="small text-muted ms-2" aria-label="Current zoom level">
                            {zoomPct}
                        </span>
                    </div>

                    <div className="small text-muted">
                        Shortcuts: + / - / 0
                    </div>
                </div>

                {imgError && (
                    <Alert variant="danger" className="mb-2">
                        {imgError}
                    </Alert>
                )}

                {/* Viewer area */}
                <div
                    ref={scrollRef}
                    style={{
                        border: "1px solid var(--color-border, rgba(0,0,0,.15))",
                        borderRadius: 12,
                        background: "var(--color-surface, #fff)",
                        overflow: "auto",
                        maxHeight: "70vh",
                        position: "relative",
                    }}
                >
                    {/* Loading overlay */}
                    {imgLoading && !imgError && (
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "rgba(255,255,255,.65)",
                                zIndex: 2,
                            }}
                        >
                            <Spinner animation="border" role="status" />
                        </div>
                    )}

                    {/* Image: zoom via width scaling so scrollbars work naturally */}
                    <img
                        src={imageUrl}
                        alt={title}
                        draggable={false}
                        onLoad={() => {
                            setImgLoading(false);
                            setImgError(null);
                        }}
                        onError={() => {
                            setImgLoading(false);
                            setImgError("Unable to load receipt image.");
                        }}
                        style={{
                            display: "block",
                            width: `${zoom * 100}%`,
                            height: "auto",
                            maxWidth: "none",
                            userSelect: "none",
                        }}
                    />
                </div>
            </Modal.Body>

            <Modal.Footer>
                <Button variant="secondary" className="rounded-pill px-4" onClick={onClose}>
                    Close
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
