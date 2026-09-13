import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

function ControlledDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Import
      </button>
      <button type="button">Update covers</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Import bookmarks</DialogTitle>
          <DialogDescription>Select a file to import.</DialogDescription>
          <button type="button">Choose file</button>
          <DialogClose>Cancel</DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("controlled dialog focus", () => {
  it("moves focus inside when opened without a DialogTrigger", async () => {
    render(<ControlledDialog />);
    const opener = screen.getByRole("button", { name: "Import" });
    opener.focus();

    fireEvent.click(opener);

    await waitFor(() => expect(screen.getByRole("button", { name: "Choose file" })).toHaveFocus());
  });

  it("returns focus to the previously focused opener when closed", async () => {
    render(<ControlledDialog />);
    const opener = screen.getByRole("button", { name: "Import" });
    opener.focus();
    fireEvent.click(opener);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    cancel.focus();

    fireEvent.click(cancel);

    await waitFor(() => expect(opener).toHaveFocus());
  });
});
