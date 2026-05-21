import { pool } from '../db/pool.js';

export class UsersService {
  async searchUsers(currentUserId: string, query: string) {
    const normalized = query.trim();

    if (!normalized) {
      return { users: [] };
    }

    const result = await pool.query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
    }>(
      `
        select
          u.id,
          u.username,
          coalesce(up.display_name, u.username) as display_name,
          avatar.public_url as avatar_url
        from users u
        left join user_profiles up on up.user_id = u.id
        left join media_assets avatar on avatar.id = up.avatar_media_id
        where u.id <> $1
          and u.email_verified_at is not null
          and (
            lower(u.username) like lower($2)
            or lower(u.email) like lower($2)
            or lower(coalesce(up.display_name, u.username)) like lower($2)
          )
        order by
          case when lower(u.username) = lower($3) then 0 else 1 end,
          u.username asc
        limit 8
      `,
      [currentUserId, `${normalized}%`, normalized]
    );

    return {
      users: result.rows
    };
  }
}

export const usersService = new UsersService();
