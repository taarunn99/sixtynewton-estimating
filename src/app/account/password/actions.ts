"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function changePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) {
    redirect(`/account/password?error=${encodeURIComponent("Use at least 10 characters")}`);
  }
  if (password !== confirm) {
    redirect(`/account/password?error=${encodeURIComponent("The two entries do not match")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/account/password?error=${encodeURIComponent("Could not change the password, try again")}`);
  }
  redirect("/?password=changed");
}
