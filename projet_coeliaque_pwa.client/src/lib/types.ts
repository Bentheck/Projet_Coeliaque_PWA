// Represents a public user profile shown in the forum
export type UserProfileDto = {
    userId: string;
    displayName: string;
    bio?: string | null;
    avatarUrl?: string | null;
    location?: string | null;
    website?: string | null;
    joinedUtc: string;       // Account creation date
    lastSeenUtc?: string | null; // Last activity timestamp
    threadCount: number;     // Total threads started by user
    postCount: number;       // Total posts across all threads
};

// Forum category container (e.g., "General", "Support")
export type ForumCategoryDto = {
    id: number;
    slug: string;
    name: string;
    description?: string | null;
    language?: string | null;

    // Visibility flags
    membersOnly?: boolean;
    adminOnlyThreadCreation?: boolean;
    isActive?: boolean;

    // Stats
    threadCount: number;

    // Computed per-request by the backend for the current user
    canCreateThread?: boolean;
};

// Lightweight thread listing (for category pages)
export type ForumThreadListItemDto = {
    id: number;
    title: string;
    createdUtc: string;
    createdBy: string;       // Display name of author
    lastPostUtc: string;     // Timestamp of last activity
    lastBy: string;          // Display name of last poster
    postCount: number;
    isLocked: boolean;
    isPinned: boolean;
};

// Full thread metadata (for thread detail page)
export type ForumThreadDto = {
    id: number;
    categoryId: number;
    title: string;
    createdUtc: string;
    createdBy: string;         // Display name of thread starter
    createdByUserId: string;   // Unique ID of thread starter (NEW: useful for linking to profile)
    lastPostUtc: string;
    lastBy: string;
    isLocked: boolean;
    isPinned: boolean;
    postCount: number;
    score: number;             // Aggregate upvotes/downvotes
    myVote: number;            // Current user's vote: -1 / 0 / +1
    canEditTitle: boolean;     // NEW: whether current user may rename thread
};

// Flat post object (used in simple views or APIs)
export type ForumPostDto = {
    id: number;
    body: string;
    createdUtc: string;
    createdBy: string;         // Display name of author
    editedUtc?: string | null;
    editedBy?: string | null;
};

// Generic paginated result wrapper
export type PagedResult<T> = {
    items: T[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
};

// Forum admin assignment
export type ForumAdminDto = {
    userId: string;
    displayName: string;
    addedUtc: string;          // When admin rights were granted
};

// Hierarchical post tree (for threaded replies)
export type ForumPostTreeDto = {
    id: number;
    body: string;
    createdUtc: string;
    createdBy: string;         // Display name of author
    createdByUserId: string;   // NEW: stable identifier for linking to profile
    editedUtc?: string | null;
    editedBy?: string | null;
    parentPostId?: number | null; // Null if top-level in thread
    score: number;             // Vote score
    myVote: number;            // Current user's vote
    repliesCount: number;      // Number of direct replies
    replies: ForumPostTreeDto[]; // Recursive reply tree
    canEdit: boolean;          // NEW: whether current user may edit this post
};

// Minimal moderator info
export type ModeratorDto = {
    userId: string;
    displayName: string;
};
