import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TabsExample = () => {
  const [value, setValue] = useState("one");
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList aria-label="Views">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

describe("Tabs", () => {
  it("moves focus and selection with arrow keys", async () => {
    render(<TabsExample />);
    const first = screen.getByRole("tab", { name: "One" });
    const second = screen.getByRole("tab", { name: "Two" });

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });

    await waitFor(() => {
      expect(second).toHaveFocus();
      expect(second).toHaveAttribute("aria-selected", "true");
    });
  });
});
