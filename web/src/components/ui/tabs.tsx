import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva } from "class-variance-authority";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

type TabsVariant = "segmented" | "underline";

interface TabsContextValue {
  variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabsContext = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs.* components must be rendered within <Tabs>");
  }
  return context;
};

const tabsListVariants = cva("flex flex-row", {
  variants: {
    variant: {
      segmented: "gap-1",
      underline: "gap-1",
    },
  },
  defaultVariants: { variant: "segmented" },
});

const tabsTriggerVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        segmented: "rounded-md px-3 py-1.5",
        underline: "rounded-t-lg rounded-b-none border-b-2 px-3 py-2",
      },
      active: { true: "", false: "" },
    },
    compoundVariants: [
      { variant: "segmented", active: true, className: "bg-background text-foreground shadow-sm" },
      {
        variant: "segmented",
        active: false,
        className:
          "text-muted-foreground hover:bg-background/50 hover:text-foreground data-active:bg-background data-active:text-foreground data-active:shadow-sm",
      },
      { variant: "underline", active: true, className: "border-primary bg-primary/5 text-primary" },
      {
        variant: "underline",
        active: false,
        // The inactive tab is a quiet control: the same resting ink and hover wash as the button kit's `quiet` variant.
        className:
          "border-transparent text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground data-active:border-primary data-active:bg-primary/5 data-active:text-primary",
      },
    ],
    defaultVariants: { variant: "segmented", active: false },
  },
);

interface TabsProps extends Omit<TabsPrimitive.Root.Props, "onValueChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
  variant?: TabsVariant;
}

function Tabs({ value, onValueChange, variant = "segmented", children, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ variant }}>
      <TabsPrimitive.Root value={value} onValueChange={(nextValue) => typeof nextValue === "string" && onValueChange(nextValue)} {...props}>
        {children}
      </TabsPrimitive.Root>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  const { variant } = useTabsContext();
  return <TabsPrimitive.List activateOnFocus className={cn(tabsListVariants({ variant }), className)} {...props} />;
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  const { variant } = useTabsContext();
  return <TabsPrimitive.Tab className={cn(tabsTriggerVariants({ variant }), className)} {...props} />;
}

export type { TabsVariant };
export { Tabs, TabsList, TabsTrigger, tabsListVariants, tabsTriggerVariants };
