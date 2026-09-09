export const isValidUserId = (userId: unknown): userId is number => {
  return typeof userId === "number" && Number.isFinite(userId) && userId > 0;
};

export const isValidString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

export const isValidDate = (dateString: string): boolean => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};
