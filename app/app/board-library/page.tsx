import { redirect } from "next/navigation";

// Preserve bookmarks after renaming the platform library; the destination checks roles.
export default function BoardLibraryPage() {
  redirect("/app/knowledge");
}
