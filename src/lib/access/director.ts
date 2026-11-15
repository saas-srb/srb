/**
 * The Director: the person who owns the workspace and always has full access in every product (decision D1, P2). This is the ONE place the
 * Director is recognised from a person's stored roles; screens ask `isDirector(person)` and never compare role names themselves.
 */
export const isDirector = (person: { roles?: readonly string[] | null } | null | undefined): boolean => Boolean(person?.roles?.includes("super_admin"));
