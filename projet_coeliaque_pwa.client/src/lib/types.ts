export type UserProfileDto = {
    userId: string;
    displayName: string;
    bio?: string | null;
    avatarUrl?: string | null;
    location?: string | null;
    website?: string | null;
    joinedUtc: string;
    lastSeenUtc?: string | null;
    threadCount: number;
    postCount: number;
};

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

    // NEW for voting on thread:
    score: number;     // total score
    myVote: number;    // -1 | 0 | 1 (current user)
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

export interface ForumPostTreeDto {
    id: number;
    body: string;
    createdUtc: string;
    createdBy: string;
    editedUtc?: string | null;
    editedBy?: string | null;
    parentPostId?: number | null;
    replies: ForumPostTreeDto[];

    // NEW for voting on posts:
    score: number;    // total score
    myVote: number;   // -1 | 0 | 1 (current user)

    // Optional server-provided count (can differ from loaded replies length)
    repliesCount?: number;
}

export type ModeratorDto = { userId: string; displayName: string };
