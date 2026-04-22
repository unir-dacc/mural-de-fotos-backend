import { buildSearchWhere } from './build-search-where';

describe('buildSearchWhere', () => {
  it('returns an empty filter when search is blank', () => {
    expect(buildSearchWhere('   ')).toEqual({});
  });

  it('searches recognized faces by linked user name on entity and cluster', () => {
    expect(buildSearchWhere('rodrigo')).toEqual({
      AND: [
        {
          OR: [
            {
              caption: {
                contains: 'rodrigo',
                mode: 'insensitive',
              },
            },
            {
              user: {
                name: {
                  contains: 'rodrigo',
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
                        contains: 'rodrigo',
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
                        contains: 'rodrigo',
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
                          contains: 'rodrigo',
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
                              contains: 'rodrigo',
                              mode: 'insensitive',
                            },
                          },
                          {
                            user: {
                              name: {
                                contains: 'rodrigo',
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
        },
      ],
    });
  });
});
