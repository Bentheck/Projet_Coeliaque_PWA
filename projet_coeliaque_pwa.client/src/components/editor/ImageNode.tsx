// ImageNode.ts
import { createElement, type ImgHTMLAttributes, type ReactElement } from "react";
import { DecoratorNode } from "lexical";
import type { LexicalNode, NodeKey } from "lexical";

export type SerializedImageNode = {
    type: "image";
    version: 1;
    src: string;
    altText?: string;
    width?: number;
    height?: number;
    className?: string;
};

export class ImageNode extends DecoratorNode<ReactElement> {
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

    createDOM(): HTMLElement {
        // DecoratorNode renders React via decorate(); wrapper only
        return document.createElement("span");
    }

    updateDOM(): boolean {
        return false;
    }

    decorate(): ReactElement {
        const { __src, __altText, __width, __height, __className } = this;
        const props: ImgHTMLAttributes<HTMLImageElement> = {
            src: __src,
            alt: __altText || "",
            className: __className || "lexical-image",
            style: { maxWidth: "100%", height: "auto" },
        };
        if (__width) props.width = __width;
        if (__height) props.height = __height;

        // No JSX here -> works in .ts
        return createElement("img", props);
    }

    exportDOM(): { element: HTMLElement } {
        const img = document.createElement("img");
        img.setAttribute("src", this.__src);
        if (this.__altText) img.setAttribute("alt", this.__altText);
        if (this.__className) img.setAttribute("class", this.__className);
        if (this.__width) img.setAttribute("width", String(this.__width));
        if (this.__height) img.setAttribute("height", String(this.__height));
        return { element: img };
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

    exportJSON(): SerializedImageNode {
        return {
            type: "image",
            version: 1,
            src: this.__src,
            altText: this.__altText,
            width: this.__width,
            height: this.__height,
            className: this.__className,
        };
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
