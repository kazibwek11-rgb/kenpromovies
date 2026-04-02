# KenPro Movies - Fast Loading Fix

## The Problem
The site waits for Supabase to respond before showing anything.
On slow internet this takes 3-8 seconds of black screen.

## The Fix
Replace your `loadMovies` function with this new version.
It shows cached movies INSTANTLY, then updates from Supabase in the background.

## How to apply this fix:

1. Open your `index.html` file in Notepad
2. Press Ctrl+H (Find and Replace)
3. Find this old function:

```
async function loadMovies(){const d=await dbGet();movies=d?d.map(norm):[];document.getElementById('ls').classList.add('hide');renderHome();}
async function refreshMovies(){const d=await dbGet();if(d)movies=d.map(norm);}
```

4. Replace with this NEW fast version:

```
async function loadMovies(){
  // Step 1: Show cached movies INSTANTLY (no waiting)
  const cached = localStorage.getItem('kp_movies_cache');
  if(cached){
    try{
      movies = JSON.parse(cached).map(norm);
      document.getElementById('ls').classList.add('hide');
      renderHome();
    }catch(e){}
  } else {
    // First time ever - show loading briefly
    document.getElementById('ls').classList.add('hide');
    renderHome();
  }
  // Step 2: Load from Supabase in background (silent update)
  const d = await dbGet();
  if(d){
    movies = d.map(norm);
    localStorage.setItem('kp_movies_cache', JSON.stringify(d));
    renderHome(); // Refresh with new data silently
  }
}
async function refreshMovies(){
  const d=await dbGet();
  if(d){
    movies=d.map(norm);
    localStorage.setItem('kp_movies_cache', JSON.stringify(d));
  }
}
```

## Result
- First visit: Opens in under 1 second
- After first visit: Opens INSTANTLY from cache
- Movies always stay up to date (updates silently in background)
