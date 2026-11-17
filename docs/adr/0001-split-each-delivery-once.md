# Split each delivery once, as the game does

A delivery's container split is made once, largest first from the sizes turned on, whatever cargo grids its
loading plan uses. Each grid takes the containers it can place, and the rest move on whole to the next grid. A
container that no grid in the plan can take stays in Remaining SCU; it is never broken into smaller containers to
fit. We chose this because the game hands a contract delivery over already split, and the player can't turn a 32
SCU container into two 16s at the terminal, so a plan built from containers the player won't actually have is
wrong.

## Considered Options

- **Re-split per grid (the earlier behaviour).** Each grid made its share of the delivery from the sizes that fit
  its shape, so a grid too short for a 32 got 16s instead. More SCU fitted on paper, but the table showed a split
  the game never gives, and the ship view showed containers the player wouldn't be carrying.

## Consequences

- A delivery can show Remaining SCU while a grid still has SCU free, when what's left is a container the grid's
  shape can't take. This is deliberate: the fix is a different grid, not a smaller container.
- Apart from its SCU, a delivery's split changes only when a size is turned off in the table header, as for a
  contract that skips that size or has a lower max container size. Its loading plan never changes it.
