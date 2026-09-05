# StudentOps Backend

## Quick Start

Run these commands from the `backend/` directory:

```bash
python -m venv .venv
```

Activate the virtual environment:

```bash
# macOS/Linux
source .venv/bin/activate

# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

Create the local environment file and fill in the Supabase and Turnstile values:

```bash
cp .env.example .env
```

On Windows PowerShell, the equivalent command is:

```powershell
Copy-Item .env.example .env
```

Start the development server:

```bash
uvicorn main:app --reload
```

The API is available at `http://localhost:8000`.