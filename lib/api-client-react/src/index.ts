export * from "./generated/api";
export * from "./custom-hooks";
export type { AuthResponse, CreateShareLinkBody, DeleteAccountRequest, ErrorResponse, File, FileAccessCondition, FileListResponse, FileStorageBackend, Folder, FolderListResponse, HealthStatus, ListFilesParams, LoginRequest, MessageResponse, RegisterRequest, RevokeAccessRequest, ShareEncryptedRequest, SharedFileResponse, StorageStatus, StorageStatusBackend, TokenGateCondition, TokenGateConditionReturnValueTest, TokenGateRequest, UpdateProfileRequest, UploadFileBody, User } from "./generated/api.schemas";
export { setBaseUrl, getBaseUrl, setAuthTokenGetter, customFetch } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
