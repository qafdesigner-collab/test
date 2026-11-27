/** The ready-made 3D pictures (in the web app's /avatars folder) a person can choose instead of a photo. */
export const AVATARS = ['teacher', 'teacher-woman', 'teacher-man', 'teacher-woman-2', 'teacher-man-2', 'graduate', 'graduate-girl', 'graduate-boy',
  'boy', 'girl', 'boy-2', 'girl-2', 'boy-3', 'girl-3', 'child', 'girl-hijab', 'girl-hijab-2', 'boy-turban',
  'owl', 'panda', 'fox', 'tiger', 'koala', 'rabbit', 'bear', 'lion', 'frog', 'monkey', 'cat', 'dog', 'penguin', 'unicorn', 'turtle', 'elephant',
  'books', 'pencil', 'backpack', 'rocket', 'star', 'palette', 'football', 'microscope', 'brain', 'bulb'] as const;

/** A person's picture: their photo, or their chosen avatar, or nothing (initials are shown). */
export const pictureUrl = (id: string, photoKeySet: boolean, photoAt: Date | string | null, avatar: string | null) =>
  photoKeySet && photoAt ? `/api/users/${id}/photo?v=${new Date(photoAt).getTime()}` : avatar && (AVATARS as readonly string[]).includes(avatar) ? `/avatars/${avatar}.webp` : null;
