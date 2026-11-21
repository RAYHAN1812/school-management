// Never send password hashes or token versions to the client.
export function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    photoUrl: user.photoUrl ?? null,
    status: user.status,
    role: user.role ? { key: user.role.key, name: user.role.name } : undefined,
    school: user.school ? { id: user.school.id, name: user.school.name, code: user.school.code } : null,
    schoolId: user.schoolId,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}
