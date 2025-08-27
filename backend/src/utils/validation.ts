export const isValidUserId = (userId: any): userId is number => {
  return Number.isFinite(userId) && userId > 0;
};

export const isValidString = (value: any): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

export const isValidDate = (dateString: string): boolean => {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};
