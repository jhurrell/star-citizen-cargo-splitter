# Cargo hauling

Planning a haul in Star Citizen: which containers each delivery comes in, and where on the ship each one is
locked, so the player knows what to unload at each drop-off.

## Cargo

**SCU**:
The game's unit of cargo volume; one SCU fills one cell of a cargo grid.

**Cargo**:
The kind of goods a delivery carries, such as Carbon or Potassium.
_Avoid_: Material, commodity

**Container**:
A box of one cargo, in one of the sizes 32, 24, 16, 8, 4, 2 or 1 SCU.
_Avoid_: Box, crate

**Pick-up**:
The location where the cargo of a delivery is loaded.

**Drop-off**:
The location where the cargo of a delivery is unloaded.

## Deliveries

**Delivery**:
One cargo, from one pick-up to one drop-off, with an amount in SCU.
_Avoid_: Row, line

**Contract**:
A paid job from the game made of one or more Contract Deliveries. It sets the container sizes its deliveries come
in.

**Max container size**:
The largest container size a contract hands out, shown when the player accepts it. A contract hands out sizes up
to it, less any it skips.

**Rank**:
The reputation tier a contract requires, such as Senior. Higher-rank contracts usually hand out larger containers.
_Avoid_: Level

**Contract Delivery**:
A delivery that is part of a contract; the game splits it into containers largest first, from the sizes the
contract hands out, whatever ship carries it.

**Container split**:
How many containers of each size a delivery comes in, such as 184 SCU as 11 × 16 and 1 × 8.
_Avoid_: Fill, counts

**Commodity Delivery**:
Cargo the player buys at one location to sell at another, in the container size the player chose.
_Avoid_: Trade, purchase

**Haul**:
Every delivery the player is carrying on one ship at once, from any number of contracts and commodity purchases.
_Avoid_: Load, table

**Remaining SCU**:
The part of a delivery not yet in any cargo grid, because the loading plan gives it none or its grids are full.
_Avoid_: Unassigned

## Ships

**Cargo grid**:
One area of a ship where containers are locked and stacked. A ship has one or more.
_Avoid_: Section, area, position

**Capacity**:
How many SCU a cargo grid holds, such as 128 for each of the Hull B's. A grid with room free may still not fit a
container's shape.

**Grid face**:
The surface of a cargo grid that containers lock to.
_Avoid_: Floor

**Loading plan**:
Which cargo grids each delivery in a haul goes to, in the order chosen; a delivery fills each of its grids in
turn.
_Avoid_: Picks, assignment
