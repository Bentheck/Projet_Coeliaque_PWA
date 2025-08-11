// src/lib/types.ts
export type ForumCategoryDto = {
    id: number;
    slug: string;
    name: string;
    description?: string | null;
    threadCount: number;
};

export type ForumThreadListItemDto = {
    id: number;
    title: string;
    createdUtc: string;
    createdBy: string;
    lastPostUtc: string;
    lastBy: string;
    postCount: number;
    isLocked: boolean;
    isPinned: boolean;
};

export type ForumThreadDto = {
    id: number;
    categoryId: number;
    title: string;
    createdUtc: string;
    createdBy: string;
    lastPostUtc: string;
    lastBy: string;
    isLocked: boolean;
    isPinned: boolean;
    postCount: number;
};

export type ForumPostDto = {
    id: number;
    body: string;
    createdUtc: string;
    createdBy: string;
    editedUtc?: string | null;
    editedBy?: string | null;
};

export type PagedResult<T> = {
    items: T[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
};

export type ForumAdminDto = {
    userId: string;
    displayName: string;
    addedUtc: string;
};

export type ModeratorDto = { userId: string; displayName: string };
