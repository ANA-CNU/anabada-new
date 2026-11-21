const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const imagePath = new RegExp(`^/board/media/(${uuid})$`);

export function boardImageId(src: unknown): string | undefined {
  return typeof src === 'string' ? imagePath.exec(src)?.[1] : undefined;
}

export const maxBoardImageBytes = 5 * 1024 * 1024;
export const maxBoardImages = 12;
export const boardImageTypes = ['image/png', 'image/jpeg', 'image/webp'] as const;
