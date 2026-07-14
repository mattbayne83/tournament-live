/** Pun-grade sample teams for dry runs and demos. */

const SAMPLE_TEAMS = [
  'Dink Dynasty',
  'Net Gains',
  'The Kitchen Rulers',
  'Big Dill Energy',
  'Drop Shot Divas',
  'Dill With It',
  'Rally Cats',
  'Court Jesters',
  'The Volley Llamas',
  'Zero Zero Two',
  'Paddle Battle',
  'Lob City',
  'Sweet Dinks',
  'Holy Volley',
  'Slice Slice Baby',
  'No Dinking Way',
  "Dinkin' Donuts",
  'The Baseliners',
  'Kitchen Nightmares',
  'Serve-ivors',
  'Smash Bros',
  "Pickle Rick's",
  'Chicken N Pickle',
  'The Ernes',
]

const SAMPLE_PLAYERS = [
  'Alex',
  'Sam',
  'Jordan',
  'Priya',
  'Casey',
  'Morgan',
  'Riley',
  'Devon',
  'Jamie',
  'Quinn',
  'Taylor',
  'Drew',
]

export function buildSampleTeams(
  count: number,
  offset = 0,
): Array<{ name: string; players: [string, string] }> {
  return Array.from({ length: count }, (_, i) => {
    const n = i + offset
    const name =
      SAMPLE_TEAMS[n % SAMPLE_TEAMS.length] +
      (n >= SAMPLE_TEAMS.length ? ` ${Math.floor(n / SAMPLE_TEAMS.length) + 1}` : '')
    const p1 = SAMPLE_PLAYERS[(i * 2 + offset) % SAMPLE_PLAYERS.length]
    const p2 = SAMPLE_PLAYERS[(i * 2 + 1 + offset) % SAMPLE_PLAYERS.length]
    return {
      name,
      players: [
        `${p1} ${String.fromCharCode(65 + (i % 26))}.`,
        `${p2} ${String.fromCharCode(66 + (i % 25))}.`,
      ] as [string, string],
    }
  })
}

/** Paste-friendly lines: “Team name, Player 1, Player 2”. */
export function sampleTeamLines(count: number, offset = 0): string {
  return buildSampleTeams(count, offset)
    .map((t) => `${t.name}, ${t.players[0]}, ${t.players[1]}`)
    .join('\n')
}
