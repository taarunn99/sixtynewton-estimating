"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { updateField } from "@/app/admin/actions";

type Props = { table: string; id: string; column: string; value: boolean };

export function ToggleCell({ table, id, column, value }: Props) {
  const [current, setCurrent] = useState(value);
  const [, startTransition] = useTransition();
  return (
    <Switch
      checked={current}
      onCheckedChange={(next: boolean) => {
        setCurrent(next);
        startTransition(async () => {
          const result = await updateField(table, id, column, next);
          if (result.error) setCurrent(!next);
        });
      }}
    />
  );
}
