"""
Forge CLI - Command line interface.

Usage:
    forge chat              Interactive chat mode
    forge index             Index the codebase
    forge search <query>    Search the codebase
    forge mcp               Run as MCP server
"""

import argparse
import sys
from pathlib import Path

from forge.config import config
from forge.agent import ForgeAgent
from forge.mcp import MCPServer


def cmd_chat(args):
    """Interactive chat mode."""
    workspace = args.workspace or str(Path.cwd())
    agent = ForgeAgent(workspace)
    
    print("Forge - Local AI Coding Agent")
    print("Deep context. Full autonomy. Zero cloud.")
    print("-" * 40)
    print("Type 'exit' to quit, 'clear' to reset history")
    print()
    
    agent.initialize()
    
    while True:
        try:
            user_input = input("You: ").strip()
            
            if not user_input:
                continue
            if user_input.lower() == "exit":
                break
            if user_input.lower() == "clear":
                agent.clear_history()
                print("History cleared.")
                continue
            
            print("\nForge: ", end="", flush=True)
            
            if args.stream:
                for chunk in agent.chat_streaming(user_input):
                    print(chunk, end="", flush=True)
                print()
            else:
                response = agent.chat(user_input)
                print(response)
            
            print()
            
        except KeyboardInterrupt:
            print("\nExiting...")
            break
        except EOFError:
            break


def cmd_index(args):
    """Index the codebase."""
    workspace = args.workspace or str(Path.cwd())
    agent = ForgeAgent(workspace)
    agent.initialize(force=args.force)
    print("Indexing complete.")


def cmd_search(args):
    """Search the codebase."""
    workspace = args.workspace or str(Path.cwd())
    agent = ForgeAgent(workspace)
    agent.initialize()
    
    ctx = agent.retriever.retrieve(args.query, max_results=args.limit)
    print(ctx.formatted)


def cmd_mcp(args):
    """Run as MCP server."""
    workspace = args.workspace or str(Path.cwd())
    server = MCPServer(workspace)
    server.run_stdio()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        prog="forge",
        description="Forge - Local AI Coding Agent",
    )
    parser.add_argument(
        "-w", "--workspace",
        help="Workspace directory (default: current directory)",
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # chat command
    chat_parser = subparsers.add_parser("chat", help="Interactive chat mode")
    chat_parser.add_argument("--stream", action="store_true", help="Stream responses")
    chat_parser.set_defaults(func=cmd_chat)
    
    # index command
    index_parser = subparsers.add_parser("index", help="Index the codebase")
    index_parser.add_argument("--force", action="store_true", help="Force re-index")
    index_parser.set_defaults(func=cmd_index)
    
    # search command
    search_parser = subparsers.add_parser("search", help="Search the codebase")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("-n", "--limit", type=int, default=5, help="Max results")
    search_parser.set_defaults(func=cmd_search)
    
    # mcp command
    mcp_parser = subparsers.add_parser("mcp", help="Run as MCP server")
    mcp_parser.set_defaults(func=cmd_mcp)
    
    args = parser.parse_args()
    
    if args.command is None:
        # Default to chat
        args.stream = False
        cmd_chat(args)
    else:
        args.func(args)


if __name__ == "__main__":
    main()

