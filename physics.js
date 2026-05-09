export function handleHorizontal(entity, keys, speed, friction, platforms) {
  let moveSpeed = speed;
  let currentFriction = friction;


  // Sliding mechanic - preserve momentum with very low friction
  if (entity.sliding) {
      currentFriction = 0.995; // Almost no friction while sliding
      moveSpeed *= 0.15; // Minimal steering while sliding
  } else if (entity.wasSliding && Math.abs(entity.vx) > 2) {
      // After slide ends, keep momentum but apply gradual friction
      currentFriction = 0.97;
  }


  if (keys.right) entity.vx += moveSpeed;
  if (keys.left) entity.vx -= moveSpeed;


  entity.vx *= currentFriction;
  entity.x += entity.vx;


  entity.wallDir = 0;


  platforms.forEach(pl => {
      if (pl.isSlope) return;


      if (
          entity.x < pl.x + pl.w &&
          entity.x + entity.w > pl.x &&
          entity.y < pl.y + pl.h &&
          entity.y + entity.h > pl.y
      ) {
          if (entity.vx > 0) {
              entity.x = pl.x - entity.w;
              entity.vx = 0;
              entity.wallDir = 1;
          } else if (entity.vx < 0) {
              entity.x = pl.x + pl.w;
              entity.vx = 0;
              entity.wallDir = -1;
          }
      }
  });
}


export function handleVertical(entity, gravity, platforms, fragile, wasGrounded, die, onLand) {
  let currentGrav = gravity;


  if (entity.sliding && !entity.grounded) {
      currentGrav *= 1.5;
  }


  entity.vy += currentGrav;
  entity.y += entity.vy;


  let onAnySlope = false;
  entity.grounded = false;


  platforms.forEach(pl => {
      if (pl.isSlope) {
          if (entity.x + entity.w > pl.x && entity.x < pl.x + pl.w) {
              let relX = (entity.x + entity.w / 2 - pl.x) / pl.w;
              relX = Math.max(0, Math.min(1, relX));
              let slopeY = pl.y1 + (pl.y2 - pl.y1) * relX;


              if (entity.y + entity.h >= slopeY && entity.y + entity.h <= slopeY + 30 + Math.abs(entity.vy)) {
                  entity.y = slopeY - entity.h;
                  entity.vy = 0;
                  entity.grounded = true;
                  onAnySlope = true;


                  let angle = Math.atan2(pl.y2 - pl.y1, pl.w);
                  if (entity.sliding) {
                      entity.vx += Math.sin(angle) * 2.0; // More speed sliding down slopes
                  } else {
                      entity.vx += Math.sin(angle) * 0.2;
                  }


                  if (!wasGrounded) onLand();
              }
          }
          return;
      }


      if (
          entity.x < pl.x + pl.w &&
          entity.x + entity.w > pl.x &&
          entity.y < pl.y + pl.h &&
          entity.y + entity.h > pl.y
      ) {
          if (entity.vy > 0) {
              if (fragile && !wasGrounded && entity.vy > 35) {
                  die("SHATTERED_IMPACT");
              }


              entity.y = pl.y - entity.h;
              entity.vy = 0;
              entity.grounded = true;


              if (!wasGrounded) onLand();
          } else if (entity.vy < 0) {
              entity.y = pl.y + pl.h;
              entity.vy = 0;
          }
      }
  });
}
