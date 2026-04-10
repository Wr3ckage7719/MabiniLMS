import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usersService } from '@/services/users.service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateAvatar } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    setAvatarUrl(user?.avatarUrl || null);
  }, [user?.avatarUrl]);

  useEffect(() => {
    const [firstToken = '', ...restTokens] = (user?.name || '').trim().split(/\s+/).filter(Boolean);
    setFirstName(firstToken);
    setLastName(restTokens.join(' '));
  }, [user?.name]);

  const avatarFallback = useMemo(() => {
    if (!user?.name) return 'U';
    const initials = user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
    return initials || user.name[0]?.toUpperCase() || 'U';
  }, [user?.name]);

  const handleOpenAvatarPicker = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload JPG, PNG, GIF, or WebP.',
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Avatar must be 5MB or less.',
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const response = await usersService.uploadAvatar(file) as { data?: { avatar_url?: string } };
      const uploadedAvatarUrl = response?.data?.avatar_url;
      if (uploadedAvatarUrl) {
        setAvatarUrl(uploadedAvatarUrl);
        updateAvatar(uploadedAvatarUrl);
      }
      toast({
        title: 'Avatar updated',
        description: 'Your profile avatar has been updated.',
      });
    } catch (error) {
      const isNetworkError = axios.isAxiosError(error) && !error.response;
      const responseMessage = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.response?.data?.message
        : undefined;
      const errorMessage = isNetworkError
        ? 'Cannot reach upload API. Check production VITE_API_URL, CORS, and backend availability.'
        : responseMessage ||
          (error instanceof Error
          ? error.message
          : 'Unable to update avatar.');

      toast({
        title: 'Upload failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleSaveProfile = async () => {
    if (!user) {
      return;
    }

    setIsSavingProfile(true);
    try {
      await usersService.updateProfile({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      });

      toast({
        title: 'Profile updated',
        description: 'Your profile details have been saved.',
      });
    } catch (error) {
      const responseMessage = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.response?.data?.message
        : undefined;

      toast({
        title: 'Save failed',
        description: responseMessage || (error instanceof Error ? error.message : 'Unable to update profile.'),
        variant: 'destructive',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={`${user?.name || 'User'} avatar`} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">{avatarFallback}</AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={isUploadingAvatar}
              />
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleOpenAvatarPicker}
                disabled={isUploadingAvatar}
                type="button"
              >
                {isUploadingAvatar ? 'Uploading...' : 'Change avatar'}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ''} className="rounded-xl" disabled />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Enable dark theme for the application</p>
            </div>
            <Switch checked={darkMode} onCheckedChange={setDarkMode} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: 'Email notifications', desc: 'Get notified about new assignments' },
            { label: 'Push notifications', desc: 'Browser push notifications' },
            { label: 'Due date reminders', desc: 'Remind me 24h before deadlines' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch defaultChecked />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button
        className="rounded-xl"
        onClick={() => {
          void handleSaveProfile();
        }}
        disabled={isSavingProfile}
      >
        {isSavingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Save changes
      </Button>
    </div>
  );
}
