import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { usersService } from '@/services/users.service';
import { useToast } from '@/hooks/use-toast';
import {
  getRoleBasedDefaultZoomLock,
  readPwaMobileZoomPolicyPreference,
  writePwaMobileZoomPolicyPreference,
} from '@/lib/pwa-zoom-policy';
import { applyThemePreference, isDarkModeEnabled } from '@/lib/theme';
import axios from 'axios';
import { Loader2 } from 'lucide-react';

interface LocalSettingsPreferences {
  darkMode: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  dueDateReminders: boolean;
}

const DEFAULT_LOCAL_SETTINGS: LocalSettingsPreferences = {
  darkMode: false,
  emailNotifications: true,
  pushNotifications: true,
  dueDateReminders: true,
};

export default function TeacherSettingsPage() {
  const { user, updateAvatar } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [darkMode, setDarkMode] = useState(() => isDarkModeEnabled());
  const [emailNotifications, setEmailNotifications] = useState(DEFAULT_LOCAL_SETTINGS.emailNotifications);
  const [pushNotifications, setPushNotifications] = useState(DEFAULT_LOCAL_SETTINGS.pushNotifications);
  const [dueDateReminders, setDueDateReminders] = useState(DEFAULT_LOCAL_SETTINGS.dueDateReminders);
  const [lockPwaMobileZoom, setLockPwaMobileZoom] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);

  const settingsStorageKey = user?.id ? `mabini:settings:${user.id}` : null;
  const roleBasedDefaultZoomLock = useMemo(() => getRoleBasedDefaultZoomLock(user?.role || null), [user?.role]);

  useEffect(() => {
    const preference = readPwaMobileZoomPolicyPreference();

    if (preference === 'enabled') {
      setLockPwaMobileZoom(true);
      return;
    }

    if (preference === 'disabled') {
      setLockPwaMobileZoom(false);
      return;
    }

    setLockPwaMobileZoom(roleBasedDefaultZoomLock);
  }, [roleBasedDefaultZoomLock]);

  useEffect(() => {
    setDarkMode(isDarkModeEnabled());

    if (!settingsStorageKey || typeof window === 'undefined') {
      setPreferencesReady(true);
      return;
    }

    try {
      const rawValue = localStorage.getItem(settingsStorageKey);
      if (!rawValue) {
        setEmailNotifications(DEFAULT_LOCAL_SETTINGS.emailNotifications);
        setPushNotifications(DEFAULT_LOCAL_SETTINGS.pushNotifications);
        setDueDateReminders(DEFAULT_LOCAL_SETTINGS.dueDateReminders);
      } else {
        const parsed = JSON.parse(rawValue) as Partial<LocalSettingsPreferences>;
        setEmailNotifications(parsed.emailNotifications ?? DEFAULT_LOCAL_SETTINGS.emailNotifications);
        setPushNotifications(parsed.pushNotifications ?? DEFAULT_LOCAL_SETTINGS.pushNotifications);
        setDueDateReminders(parsed.dueDateReminders ?? DEFAULT_LOCAL_SETTINGS.dueDateReminders);
      }
    } catch {
      setEmailNotifications(DEFAULT_LOCAL_SETTINGS.emailNotifications);
      setPushNotifications(DEFAULT_LOCAL_SETTINGS.pushNotifications);
      setDueDateReminders(DEFAULT_LOCAL_SETTINGS.dueDateReminders);
    } finally {
      setPreferencesReady(true);
    }
  }, [settingsStorageKey]);

  useEffect(() => {
    setAvatarUrl(user?.avatarUrl || null);
  }, [user?.avatarUrl]);

  useEffect(() => {
    const [firstToken = '', ...restTokens] = (user?.name || '').trim().split(/\s+/).filter(Boolean);
    setFirstName(firstToken);
    setLastName(restTokens.join(' '));
  }, [user?.name]);

  const avatarFallback = useMemo(() => {
    if (!user?.name) return 'T';
    const initials = user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
    return initials || user.name[0]?.toUpperCase() || 'T';
  }, [user?.name]);

  const handleOpenAvatarPicker = () => {
    fileInputRef.current?.click();
  };

  const handleDarkModeChange = (enabled: boolean) => {
    setDarkMode(enabled);
    applyThemePreference(enabled ? 'dark' : 'light');
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
    let profileSaveError: string | null = null;

    const [initialFirstToken = '', ...initialRestTokens] = (user.name || '').trim().split(/\s+/).filter(Boolean);
    const initialFirstName = initialFirstToken.trim();
    const initialLastName = initialRestTokens.join(' ').trim();
    const nextFirstName = firstName.trim();
    const nextLastName = lastName.trim();

    const hasProfileNameChanges =
      nextFirstName !== initialFirstName || nextLastName !== initialLastName;

    if (hasProfileNameChanges) {
      try {
        await usersService.updateProfile({
          first_name: nextFirstName || undefined,
          last_name: nextLastName || undefined,
        });
      } catch (error) {
        const responseMessage = axios.isAxiosError(error)
          ? error.response?.data?.error?.message || error.response?.data?.message
          : undefined;
        profileSaveError = responseMessage || (error instanceof Error ? error.message : 'Unable to update profile.');
      }
    }

    if (settingsStorageKey && typeof window !== 'undefined') {
      const preferences: LocalSettingsPreferences = {
        darkMode,
        emailNotifications,
        pushNotifications,
        dueDateReminders,
      };
      localStorage.setItem(settingsStorageKey, JSON.stringify(preferences));
      applyThemePreference(darkMode ? 'dark' : 'light');
    }

    writePwaMobileZoomPolicyPreference(
      lockPwaMobileZoom === roleBasedDefaultZoomLock
        ? 'auto'
        : lockPwaMobileZoom
          ? 'enabled'
          : 'disabled'
    );

    if (profileSaveError) {
      toast({
        title: 'Profile save failed',
        description: `${profileSaveError} Appearance and notification settings were saved locally.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Settings saved',
        description: 'Your profile and preferences have been saved.',
      });
    }

    setIsSavingProfile(false);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={`${user?.name || 'Teacher'} avatar`} />}
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
            <Switch checked={darkMode} onCheckedChange={handleDarkModeChange} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Lock zoom in installed mobile app</p>
              <p className="text-xs text-muted-foreground">
                Applies only in PWA mode. Role default is {roleBasedDefaultZoomLock ? 'On' : 'Off'}.
              </p>
            </div>
            <Switch checked={lockPwaMobileZoom} onCheckedChange={setLockPwaMobileZoom} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Student submissions</p>
              <p className="text-xs text-muted-foreground">Notify when students submit assignments</p>
            </div>
            <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Grading reminders</p>
              <p className="text-xs text-muted-foreground">Remind me when assignments need grading</p>
            </div>
            <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Class announcements</p>
              <p className="text-xs text-muted-foreground">Notify on new class announcements</p>
            </div>
            <Switch checked={dueDateReminders} onCheckedChange={setDueDateReminders} />
          </div>
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
