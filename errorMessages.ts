export const ERROR_MESSAGES: {
  REDIS_ERROR: string;
  USERNAME_TAKEN: string;
  SIGNUP_ERROR: string;
  INVALID_PIXEL: string;
  COOLDOWN_ACTIVE: string;
  BACKUP_FETCH_ERROR: string;
  BACKUP_ERROR: string;
} = {
  REDIS_ERROR: "Redis error: ",
  USERNAME_TAKEN: "Username already taken.",
  SIGNUP_ERROR: "An error occurred during signup.",
  INVALID_PIXEL: "Invalid pixel data.",
  COOLDOWN_ACTIVE: "cooldown_active",
  BACKUP_FETCH_ERROR: "Error fetching latest backup from Supabase:",
  BACKUP_ERROR: "Error backing up canvas to Supabase:",
};
