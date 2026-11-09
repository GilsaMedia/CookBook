import type { ReactNode } from 'react';

interface TopBarProps {
  title: string;
  trailing?: ReactNode;
}

export function TopBar({ title, trailing }: TopBarProps) {
  return (
    <header className="top-bar">
      <h1 className="top-bar__title">{title}</h1>
      {trailing}
    </header>
  );
}
