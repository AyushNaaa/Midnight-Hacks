"""Simple 2D game map with walls and obstacles for the simulator."""
import random


class Wall:
    """A wall segment defined by two endpoints."""
    def __init__(self, x1: float, y1: float, x2: float, y2: float):
        self.x1, self.y1 = x1, y1
        self.x2, self.y2 = x2, y2


class GameMap:
    """Simple multi-room FPS map (100x100 units).

    Layout:
    +-----------+-----------+
    |           |           |
    |  Spawn A  |  Mid      |
    |         [door]        |
    +-----------+-----------+
    |           |           |
    |   Hall    |  Spawn B  |
    |         [door]        |
    +-----------+-----------+

    TODO: Team members can add more complex layouts, cover positions, etc.
    """

    WIDTH = 100.0
    HEIGHT = 100.0

    def __init__(self):
        self.walls: list[Wall] = []
        self._build_map()
        self.waypoints = self._generate_waypoints()

    def _build_map(self):
        """Create simple room layout."""
        # Outer walls
        self.walls.append(Wall(0, 0, 100, 0))
        self.walls.append(Wall(100, 0, 100, 100))
        self.walls.append(Wall(100, 100, 0, 100))
        self.walls.append(Wall(0, 100, 0, 0))

        # Center cross walls with doorways
        # Horizontal wall (gap at 45-55 for doorway)
        self.walls.append(Wall(0, 50, 45, 50))
        self.walls.append(Wall(55, 50, 100, 50))
        # Vertical wall (gap at 45-55 for doorway)
        self.walls.append(Wall(50, 0, 50, 45))
        self.walls.append(Wall(50, 55, 50, 100))

    def _generate_waypoints(self) -> list[tuple[float, float]]:
        """Key navigation points players move between."""
        return [
            (15, 15), (35, 15), (15, 35), (35, 35),  # Room A (Spawn A)
            (65, 15), (85, 15), (65, 35), (85, 35),  # Room B
            (15, 65), (35, 65), (15, 85), (35, 85),  # Room C
            (65, 65), (85, 65), (65, 85), (85, 85),  # Room D (Spawn B)
            (50, 50),  # Center intersection
        ]

    def random_waypoint(self) -> tuple[float, float]:
        return random.choice(self.waypoints)

    def line_of_sight(self, x1: float, y1: float, x2: float, y2: float) -> bool:
        """Check if two points have line of sight (no walls between them).
        Uses simple line-segment intersection test.
        """
        for wall in self.walls:
            if self._segments_intersect(x1, y1, x2, y2, wall.x1, wall.y1, wall.x2, wall.y2):
                return False
        return True

    @staticmethod
    def _segments_intersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) -> bool:
        """Check if two line segments intersect."""
        def cross(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

        p1, p2 = (ax1, ay1), (ax2, ay2)
        p3, p4 = (bx1, by1), (bx2, by2)

        d1 = cross(p3, p4, p1)
        d2 = cross(p3, p4, p2)
        d3 = cross(p1, p2, p3)
        d4 = cross(p1, p2, p4)

        if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
           ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
            return True
        return False
