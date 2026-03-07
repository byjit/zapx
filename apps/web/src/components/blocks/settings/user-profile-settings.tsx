import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function UserProfileSettings({ session }: { session: any }) {
  const [name, setName] = useState(session.user.name || "");
  const [image, setImage] = useState(session.user.image || "");
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdateProfile = async () => {
    setIsLoading(true);
    try {
      await authClient.updateUser({
        name,
        image,
      });
      toast.success("Profile updated successfully");
    } catch (_error) {
      toast.error("Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>
          Update your public profile information.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={image} />
            <AvatarFallback>{name?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">Display Name</Label>
          <Input
            id="name"
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            value={name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input disabled id="email" value={session.user.email} />
          <p className="text-xs text-muted-foreground">
            Email cannot be changed currently.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="image">Profile Image URL</Label>
          <Input
            id="image"
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://example.com/avatar.png"
            value={image}
          />
        </div>
        <div className="flex justify-end">
          <Button disabled={isLoading} onClick={handleUpdateProfile}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
