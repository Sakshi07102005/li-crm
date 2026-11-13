// src/ui/Card.tsx
import React from 'react';

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-white shadow">{children}</div>;
}
export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="border-b px-4 py-2">{children}</div>;
}
export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-medium">{children}</h2>;
}
export function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="p-4">{children}</div>;
}

