import { Prisma } from '@prisma/client';

export function buildSearchWhere(raw: string): Prisma.PostWhereInput {
  const term = raw.trim();
  if (!term) return {};

  const tokens = term.split(/\s+/);

  const tokenConditions: Prisma.PostWhereInput[] = tokens.map((token) => ({
    OR: [
      {
        caption: {
          contains: token,
          mode: 'insensitive',
        },
      },
      {
        user: {
          name: {
            contains: token,
            mode: 'insensitive',
          },
        },
      },
      {
        Media: {
          some: {
            entities: {
              some: {
                name: {
                  contains: token,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      },
      {
        Media: {
          some: {
            entities: {
              some: {
                className: {
                  contains: token,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      },
      {
        Media: {
          some: {
            entities: {
              some: {
                User: {
                  name: {
                    contains: token,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
        },
      },
      {
        Media: {
          some: {
            entities: {
              some: {
                EntityCluster: {
                  OR: [
                    {
                      name: {
                        contains: token,
                        mode: 'insensitive',
                      },
                    },
                    {
                      user: {
                        name: {
                          contains: token,
                          mode: 'insensitive',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  }));

  return {
    AND: tokenConditions,
  };
}
