import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { buttonTextVariants, buttonVariants } from "@/components/ui/button-variants";
import type { VariantProps } from "class-variance-authority";
import { Pressable } from "react-native";

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(props.disabled && "opacity-50", buttonVariants({ variant, size }), className)}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button };
export type { ButtonProps };
