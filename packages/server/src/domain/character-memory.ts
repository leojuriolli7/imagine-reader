import type { CharacterAppearance, CharacterUpdate } from "@imagine/contracts/planning";
import { Effect } from "effect";
import { InvalidPlan } from "./errors";

const key = (name: string) => name.normalize("NFKC").trim().toLocaleLowerCase("en");
const names = (character: CharacterUpdate) => [character.name, ...character.aliases].map(key);

/** Append-only appearance history keeps future descriptions out of earlier image prompts. */
export class CharacterMemory {
  constructor(readonly history: readonly CharacterAppearance[]) {}

  at(page: number): readonly CharacterAppearance[] {
    const latest = new Map<string, CharacterAppearance>();

    for (const version of this.history) {
      if (version.knownAfterPage > page) continue;

      const previous = latest.get(version.characterId);

      if (!previous || previous.knownAfterPage <= version.knownAfterPage)
        latest.set(version.characterId, version);
    }

    return [...latest.values()];
  }

  append = Effect.fn("CharacterMemory.append")(function* (
    this: CharacterMemory,
    updates: readonly CharacterUpdate[],
    bookId: string,
  ) {
    const history = [...this.history];

    for (const update of [...updates].sort((a, b) => a.knownAfterPage - b.knownAfterPage)) {
      const aliases = new Set(names(update));
      const matches = history.filter((version) => names(version).some((name) => aliases.has(name)));
      const identities = new Set(matches.map((version) => version.characterId));

      if (identities.size > 1)
        return yield* new InvalidPlan({ message: `Ambiguous character aliases: ${update.name}` });

      const previous = matches.at(-1);
      const characterId =
        previous?.characterId ??
        `${bookId}:character:${new Set(history.map((v) => v.characterId)).size}`;
      const inheritedAliases = matches.flatMap((version) => [version.name, ...version.aliases]);

      history.push({
        ...update,
        characterId,
        aliases: [...new Set([...update.aliases, ...inheritedAliases])].filter(
          (name) => key(name) !== key(update.name),
        ),
      });
    }

    return new CharacterMemory(history);
  });

  resolve = Effect.fn("CharacterMemory.resolve")(function* (
    this: CharacterMemory,
    references: readonly string[],
    page: number,
  ) {
    const available = this.at(page);
    const selected: CharacterAppearance[] = [];

    for (const reference of references) {
      const matches = available.filter((version) => names(version).includes(key(reference)));

      if (matches.length !== 1)
        return yield* new InvalidPlan({
          message: `Character appearance is unavailable or ambiguous at page ${page}: ${reference}`,
        });

      const character = matches[0];

      if (character && !selected.some((value) => value.characterId === character.characterId))
        selected.push(character);
    }

    return selected;
  });
}
