"""
VF Healthcare Agent - Command Line Interface

Interactive CLI for querying the healthcare intelligence pipeline.
Provides a REPL interface with rich formatting for results.

Usage Examples:
    # Interactive mode (REPL)
    python main.py
    
    # Single query mode
    python main.py "How many hospitals have cardiology?"
    
    # Initialize data only
    python main.py --init
    
    # Verbose logging
    python main.py --verbose

Features:
    - Rich console output with formatted results
    - Citation display with evidence
    - Pipeline metadata (agents, timing, iterations)
    - Interactive query history
    - Graceful error handling

Environment Variables:
    OPENAI_API_KEY: Required for LLM operations
    OPENAI_MODEL: Model to use (default: gpt-4o)
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from typing import Any, Dict, List

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

console = Console()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── CLI Formatting ──────────────────────────────────────────────────────────


def print_header() -> None:
    """Display the welcome banner for interactive mode."""
    console.print(
        Panel(
            "[bold blue]VF Healthcare Intelligence Agent[/bold blue]\n"
            "[dim]Agentic AI for Global Healthcare Access — Virtue Foundation[/dim]\n\n"
            "[dim]Type your question in natural language.[/dim]\n"
            "[dim]Commands: 'quit', 'exit', or Ctrl+C to exit[/dim]",
            border_style="blue",
        )
    )


def display_citations(citations: List[Dict[str, Any]], max_display: int = 10) -> None:
    """
    Display citations in a formatted table.
    
    Args:
        citations: List of citation dictionaries
        max_display: Maximum number of citations to show
    """
    if not citations:
        return
    
    console.print("\n[bold yellow]📚 Citations:[/bold yellow]")
    
    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("#", justify="right", style="dim")
    table.add_column("Facility", style="bold")
    table.add_column("Source", style="cyan")
    table.add_column("Evidence", style="dim")
    
    for i, citation in enumerate(citations[:max_display], 1):
        name = citation.get("facility_name", "Unknown")
        source = citation.get("data_source", "Unknown")
        evidence = citation.get("evidence", "")[:80]
        if len(citation.get("evidence", "")) > 80:
            evidence += "..."
        
        table.add_row(str(i), name, source, evidence)
    
    console.print(table)
    
    if len(citations) > max_display:
        console.print(
            f"[dim]... and {len(citations) - max_display} more citations[/dim]"
        )


def display_metadata(result: Dict[str, Any], elapsed: float) -> None:
    """
    Display query metadata in a formatted panel.
    
    Args:
        result: Query result dictionary
        elapsed: Query execution time in seconds
    """
    intent = result.get("intent", "unknown")
    agents = result.get("required_agents", [])
    iteration = result.get("iteration", 1)
    citations = result.get("citations", [])
    
    # Create agent emoji map
    agent_icons = {
        "text2sql": "🗄️",
        "vector_search": "🔍",
        "geospatial": "📍",
        "external_data": "🌐",
    }
    agent_display = " → ".join(
        f"{agent_icons.get(a, '⚙️')} {a}" for a in agents
    )
    
    metadata_text = (
        f"[bold]Intent:[/bold] {intent}\n"
        f"[bold]Pipeline:[/bold] {agent_display}\n"
        f"[bold]Iterations:[/bold] {iteration}\n"
        f"[bold]Citations:[/bold] {len(citations)}\n"
        f"[bold]Time:[/bold] {elapsed:.2f}s"
    )
    
    console.print(
        Panel(
            metadata_text,
            title="📊 Pipeline Metadata",
            border_style="dim",
            expand=False,
        )
    )


# ── Query Execution ─────────────────────────────────────────────────────────


def run_single_query(query: str, verbose: bool = False) -> None:
    """
    Execute a single query and display results.
    
    Args:
        query: Natural language question
        verbose: Whether to show detailed logging
    """
    from src.graph import run_query

    console.print(f"\n[bold cyan]❓ Query:[/bold cyan] {query}\n")

    with console.status("[bold green]🤔 Processing...", spinner="dots"):
        start_time = time.time()
        try:
            result = run_query(query)
            elapsed = time.time() - start_time
        except Exception as e:
            elapsed = time.time() - start_time
            console.print(
                Panel(
                    f"[bold red]Error:[/bold red] {str(e)}\n\n"
                    f"[dim]This may be due to:[/dim]\n"
                    f"[dim]• OpenAI API rate limits[/dim]\n"
                    f"[dim]• Network connectivity issues[/dim]\n"
                    f"[dim]• Invalid query format[/dim]",
                    title="❌ Query Failed",
                    border_style="red",
                )
            )
            logger.error(f"Query failed after {elapsed:.2f}s", exc_info=verbose)
            return

    # Display response
    synthesis = result.get("synthesis", "No response generated.")
    console.print(
        Panel(
            Markdown(synthesis),
            title="💡 Answer",
            border_style="green",
        )
    )

    # Display metadata
    display_metadata(result, elapsed)

    # Display citations
    citations = result.get("citations", [])
    if citations:
        display_citations(citations)


# ── Interactive Mode ────────────────────────────────────────────────────────


def interactive_mode(verbose: bool = False) -> None:
    """
    Start an interactive REPL session.
    
    Args:
        verbose: Whether to show detailed logging
    """
    print_header()
    query_count = 0

    while True:
        try:
            query = console.input("\n[bold blue]>[/bold blue] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print(
                f"\n[dim]Goodbye! Processed {query_count} queries.[/dim]"
            )
            break

        if not query:
            continue
            
        if query.lower() in ("quit", "exit", "q"):
            console.print(
                f"[dim]Goodbye! Processed {query_count} queries.[/dim]"
            )
            break

        run_single_query(query, verbose=verbose)
        query_count += 1


# ── Main Entry Point ────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="VF Healthcare Intelligence Agent CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                                    # Interactive mode
  %(prog)s "How many hospitals have cardiology?"  # Single query
  %(prog)s --init                             # Initialize data only
  %(prog)s --verbose                          # Enable verbose logging
        """,
    )
    
    parser.add_argument(
        "query",
        nargs="*",
        help="Natural language query (if not provided, enters interactive mode)",
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="Initialize data layer and exit",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    
    return parser.parse_args()


def main() -> None:
    """Main CLI entry point."""
    args = parse_args()
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Initialize data layer only
    if args.init:
        console.print("[bold]🔧 Initializing data layer...[/bold]")
        try:
            from src.graph import initialize_data
            initialize_data()
            console.print("[bold green]✅ Initialization complete![/bold green]")
        except Exception as e:
            console.print(f"[bold red]❌ Initialization failed: {e}[/bold red]")
            logger.error("Initialization failed", exc_info=True)
            sys.exit(1)
        return

    # Ensure data is initialized
    try:
        from src.graph import initialize_data
        console.print("[dim]Initializing data layer...[/dim]")
        initialize_data()
    except Exception as e:
        console.print(
            f"[bold red]❌ Failed to initialize data layer: {e}[/bold red]"
        )
        logger.error("Data initialization failed", exc_info=True)
        sys.exit(1)

    # Single query mode
    if args.query:
        query_text = " ".join(args.query)
        run_single_query(query_text, verbose=args.verbose)
        return

    # Interactive mode
    interactive_mode(verbose=args.verbose)


if __name__ == "__main__":
    main()
