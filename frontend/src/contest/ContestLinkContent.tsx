import { ArrowLeft, ArrowUpRight, FileText } from "lucide-react";
import styles from "./contest-archive.module.css";

const icons = {
  forward: ArrowUpRight,
  back: ArrowLeft,
  editorial: FileText,
};

type ContestLinkContentProps = {
  readonly children: string;
  readonly icon?: keyof typeof icons;
  readonly size?: number;
};

export function ContestLinkContent({ children, icon = "forward", size = 16 }: ContestLinkContentProps) {
  const Icon = icons[icon];

  return (
    <span className={styles.actionContent}>
      <span className={styles.actionText}>{children}</span>
      {/* Align the painted icon with the font while keeping the SVG box centered. */}
      <Icon
        aria-hidden="true"
        className={styles.actionIcon}
        data-leading={icon !== "forward" || undefined}
        size={size}
        viewBox="0 1.5 24 24"
      />
    </span>
  );
}
