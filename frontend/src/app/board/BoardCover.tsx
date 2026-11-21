import { SquircleSurface } from '@/components/ui/squircle';
import styles from './cards.module.css';

export function BoardCover({ id, wide = false }: { readonly id: string; readonly wide?: boolean }) {
  const tone = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0) % 3;
  return (
    <SquircleSurface
      className={`${styles.cover} ${wide ? styles.wide : ''}`}
      data-tone={tone}
      aria-hidden="true"
    />
  );
}
