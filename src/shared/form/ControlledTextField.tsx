import React, { ComponentProps } from "react";
import {
  useController,
  Control,
  FieldValues,
  FieldPath,
} from "react-hook-form";
import { TextField } from "@shared/ui";

type TextFieldProps = ComponentProps<typeof TextField>;

interface Props<T extends FieldValues> extends Omit<
  TextFieldProps,
  "value" | "onChangeText" | "onBlur" | "error"
> {
  control: Control<T>;
  name: FieldPath<T>;
}

/** binds a TextField to react-hook-form, including its validation error. */
export function ControlledTextField<T extends FieldValues>({
  control,
  name,
  ...rest
}: Props<T>) {
  const { field, fieldState } = useController({ control, name });
  return (
    <TextField
      {...rest}
      value={field.value == null ? "" : String(field.value)}
      onChangeText={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  );
}
