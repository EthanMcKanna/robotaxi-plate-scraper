"""
Build and configure the LangGraph workflow.
"""
from langgraph.graph import StateGraph, END
from .graph_state import AgentState
from .graph_nodes import (
    fetch_posts_node,
    analyze_candidates_node,
    route_candidates_node
)


def build_agent_graph():
    """Build the LangGraph workflow."""
    
    # Create the graph
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("fetch_posts", fetch_posts_node)
    workflow.add_node("analyze_candidates", analyze_candidates_node)
    workflow.add_node("route_candidates", route_candidates_node)
    
    # Define edges
    workflow.set_entry_point("fetch_posts")
    workflow.add_edge("fetch_posts", "analyze_candidates")
    workflow.add_edge("analyze_candidates", "route_candidates")
    workflow.add_edge("route_candidates", END)
    
    # Compile the graph
    app = workflow.compile()
    
    return app

