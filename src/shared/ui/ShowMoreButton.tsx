import React from "react";
import { Button } from "./Button";

interface Props {
  /** Rows not yet rendered. Nothing is shown when there are none. */
  hidden: number;
  pageSize: number;
  onPress: () => void;
  /** What the rows are — "bills", "prescriptions". */
  noun: string;
  testID?: string;
}

/** The "show more" at the foot of a progressively rendered list. See useProgressiveList. */
export function ShowMoreButton({ hidden, pageSize, onPress, noun, testID }: Props) {
  if (hidden <= 0) return null;
  return (
    <Button
      label={`Show ${Math.min(hidden, pageSize)} more ${noun} (${hidden} not shown)`}
      variant="secondary"
      size="sm"
      onPress={onPress}
      testID={testID}
    />
  );
}
