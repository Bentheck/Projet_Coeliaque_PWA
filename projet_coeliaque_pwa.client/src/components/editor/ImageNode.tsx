// components/PostEditor/editor/ImageNode.tsx
import type * as React from "react";
import { DecoratorNode } from "lexical";
import type {
    DOMConversionMap,
    DOMConversionOutput,
    LexicalNode,
    NodeKey,
    SerializedLexicalNode,
} from "lexical";

export type SerializedImageNode = SerializedLexicalNode & {
    type: "image";
    version: 1;
    src: string;
    altText?: string;
    width?: number;
    height?: number;
    className?: string;
};

export class ImageNode extends DecoratorNode<React.ReactElement> {
    __src: string;
    __altText: string;
    __width?: number;
    __height?: number;
    __className?: string;

    static getType(): string {
        return "image";
    }

    static clone(node: ImageNode): ImageNode {
        return new ImageNode(
            node.__src,
            node.__altText,
            node.__width,
            node.__height,
            node.__className,
            node.__key
        );
    }

    // Tell Lexical how to import <img> from HTML/DOM
    static importDOM(): DOMConversionMap {
        return {
            img: (domNode: Node) => {
                if (!(domNode instanceof HTMLImageElement)) return null;
                return {
                    conversion: () => {
                        const el = domNode as HTMLImageElement;
                        const width = el.getAttribute("width");
                        const height = el.getAttribute("height");
                        return {
                            node: new ImageNode(
                                el.src || "",
                                el.alt || "",
                                width ? Number(width) : undefined,
                                height ? Number(height) : undefined,
                                el.className || undefined
                            ),
                        } as DOMConversionOutput;
                    },
                    priority: 0,
                };
            },
        };
    }

    static importJSON(json: SerializedImageNode): ImageNode {
        return new ImageNode(
            json.src,
            json.altText ?? "",
            json.width,
            json.height,
            json.className
        );
    }

    constructor(
        src: string,
        altText = "",
        width?: number,
        height?: number,
        className?: string,
        key?: NodeKey
    ) {
        super(key);
        this.__src = src;
        this.__altText = altText;
        this.__width = width;
        this.__height = height;
        this.__className = className;
    }

    exportJSON(): SerializedImageNode {
        return {
            ...super.exportJSON(),
            type: "image",
            version: 1,
            src: this.__src,
            altText: this.__altText,
            width: this.__width,
            height: this.__height,
            className: this.__className,
        };
    }

    // For HTML export (used by $generateHtmlFromNodes)
    exportDOM(): { element: HTMLElement } {
        const img = document.createElement("img");
        img.setAttribute("src", this.__src);
        if (this.__altText) img.setAttribute("alt", this.__altText);
        if (this.__className) img.setAttribute("class", this.__className);
        if (this.__width) img.setAttribute("width", String(this.__width));
        if (this.__height) img.setAttribute("height", String(this.__height));
        return { element: img };
    }

    createDOM(): HTMLElement {
        // DecoratorNode renders React in decorate(); wrapper element is fine
        return document.createElement("span");
    }

    updateDOM(): boolean {
        return false;
    }

    // Optional: what this node contributes to plain text selections
    getTextContent(): string {
        return this.__altText || "";
    }

    decorate(): React.ReactElement {
        const { __src, __altText, __width, __height, __className } = this;
        const props: React.ImgHTMLAttributes<HTMLImageElement> = {
            src: __src,
            alt: __altText || "",
            className: __className || "lexical-image",
            style: { maxWidth: "100%", height: "auto" }, // in-editor friendliness
        };
        if (__width) props.width = __width;
        if (__height) props.height = __height;
        // eslint-disable-next-line react/react-in-jsx-scope
        return <img {...props} />;
    }
}

export function $createImageNode(payload: {
    src: string;
    altText?: string;
    width?: number;
    height?: number;
    className?: string;
}): ImageNode {
    return new ImageNode(
        payload.src,
        payload.altText ?? "",
        payload.width,
        payload.height,
        payload.className
    );
}

export function $isImageNode(node: LexicalNode): node is ImageNode {
    return node instanceof ImageNode;
}
