import { changePassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif">Change password</CardTitle>
          <CardDescription>
            Set your own password on first login. At least 10 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={changePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">Repeat it</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <Button type="submit">Change password</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
