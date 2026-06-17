import azure.functions as func
import json
import logging
import os
import base64
import uuid
from datetime import datetime, timezone

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
from azure.data.tables import TableServiceClient, TableClient
from azure.core.exceptions import ResourceNotFoundError

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Configuration
PROJECT_ENDPOINT = os.environ.get("PROJECT_ENDPOINT", "https://mcp-usecase.services.ai.azure.com/api/projects/proj-default")
AGENT_ID = os.environ.get("AGENT_ID", "605e4f3e-1a16-43dc-891b-bba3d9ab542d")
STORAGE_CONNECTION_STRING = os.environ.get("AZURE_STORAGE_CONNECTION_STRING", "")
TABLE_NAME = "conversations"

# Initialize credentials
credential = DefaultAzureCredential()


def get_user_id(req: func.HttpRequest) -> dict:
    """Extract user identity from x-ms-client-principal header (EasyAuth)."""
    principal_header = req.headers.get("x-ms-client-principal")
    if not principal_header:
        # For local development, return a test user
        return {"user_id": "local-dev-user", "user_name": "Developer", "user_email": "dev@local.com"}
    
    try:
        decoded = base64.b64decode(principal_header)
        principal = json.loads(decoded)
        user_id = principal.get("userId", "unknown")
        claims = principal.get("claims", [])
        
        user_name = "User"
        user_email = ""
        for claim in claims:
            if claim.get("typ") == "name":
                user_name = claim.get("val", "User")
            elif claim.get("typ") in ["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "preferred_username"]:
                user_email = claim.get("val", "")
        
        return {"user_id": user_id, "user_name": user_name, "user_email": user_email}
    except Exception as e:
        logging.error(f"Error parsing client principal: {e}")
        return {"user_id": "unknown", "user_name": "Unknown", "user_email": ""}


def get_table_client() -> TableClient:
    """Get Azure Table Storage client for conversation persistence."""
    table_service = TableServiceClient.from_connection_string(STORAGE_CONNECTION_STRING)
    table_service.create_table_if_not_exists(TABLE_NAME)
    return table_service.get_table_client(TABLE_NAME)


def get_ai_client() -> AIProjectClient:
    """Get Azure AI Project client."""
    return AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=credential
    )


# ============================================================
# /api/user - Get current user info
# ============================================================
@app.route(route="user", methods=["GET"])
def get_user(req: func.HttpRequest) -> func.HttpResponse:
    """Return current authenticated user information."""
    user = get_user_id(req)
    return func.HttpResponse(
        json.dumps(user),
        mimetype="application/json",
        status_code=200
    )


# ============================================================
# /api/conversations - List conversations or create new one
# ============================================================
@app.route(route="conversations", methods=["GET", "POST"])
def conversations(req: func.HttpRequest) -> func.HttpResponse:
    """GET: List user's conversations. POST: Create new conversation."""
    user = get_user_id(req)
    
    if req.method == "GET":
        return list_conversations(user)
    elif req.method == "POST":
        return create_conversation(user)


def list_conversations(user: dict) -> func.HttpResponse:
    """List all conversations for the authenticated user."""
    try:
        table_client = get_table_client()
        query_filter = f"PartitionKey eq '{user['user_id']}'"
        entities = table_client.query_entities(query_filter)
        
        conversations = []
        for entity in entities:
            conversations.append({
                "id": entity["RowKey"],
                "thread_id": entity.get("thread_id", ""),
                "title": entity.get("title", "New Conversation"),
                "created_at": entity.get("created_at", ""),
                "last_message_at": entity.get("last_message_at", ""),
                "preview": entity.get("preview", "")
            })
        
        # Sort by last_message_at descending
        conversations.sort(key=lambda x: x.get("last_message_at", ""), reverse=True)
        
        return func.HttpResponse(
            json.dumps({"conversations": conversations}),
            mimetype="application/json",
            status_code=200
        )
    except Exception as e:
        logging.error(f"Error listing conversations: {e}")
        return func.HttpResponse(
            json.dumps({"error": "Failed to list conversations"}),
            mimetype="application/json",
            status_code=500
        )


def create_conversation(user: dict) -> func.HttpResponse:
    """Create a new conversation (thread) for the user."""
    try:
        # Create thread in Azure AI Foundry
        ai_client = get_ai_client()
        thread = ai_client.agents.create_thread()
        
        # Store conversation metadata
        conversation_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        table_client = get_table_client()
        entity = {
            "PartitionKey": user["user_id"],
            "RowKey": conversation_id,
            "thread_id": thread.id,
            "title": "New Conversation",
            "created_at": now,
            "last_message_at": now,
            "preview": ""
        }
        table_client.create_entity(entity)
        
        return func.HttpResponse(
            json.dumps({
                "id": conversation_id,
                "thread_id": thread.id,
                "title": "New Conversation",
                "created_at": now
            }),
            mimetype="application/json",
            status_code=201
        )
    except Exception as e:
        logging.error(f"Error creating conversation: {e}")
        return func.HttpResponse(
            json.dumps({"error": f"Failed to create conversation: {str(e)}"}),
            mimetype="application/json",
            status_code=500
        )


# ============================================================
# /api/conversations/{conversation_id} - Get or delete conversation
# ============================================================
@app.route(route="conversations/{conversation_id}", methods=["GET", "DELETE"])
def conversation_detail(req: func.HttpRequest) -> func.HttpResponse:
    """GET: Get conversation messages. DELETE: Delete conversation."""
    user = get_user_id(req)
    conversation_id = req.route_params.get("conversation_id")
    
    if req.method == "GET":
        return get_conversation_messages(user, conversation_id)
    elif req.method == "DELETE":
        return delete_conversation(user, conversation_id)


def get_conversation_messages(user: dict, conversation_id: str) -> func.HttpResponse:
    """Retrieve all messages for a conversation."""
    try:
        # Get thread_id from storage
        table_client = get_table_client()
        entity = table_client.get_entity(partition_key=user["user_id"], row_key=conversation_id)
        thread_id = entity.get("thread_id")
        
        if not thread_id:
            return func.HttpResponse(
                json.dumps({"error": "Conversation not found"}),
                mimetype="application/json",
                status_code=404
            )
        
        # Get messages from Azure AI Foundry
        ai_client = get_ai_client()
        messages = ai_client.agents.list_messages(thread_id=thread_id)
        
        formatted_messages = []
        for msg in messages.data:
            content_text = ""
            for content_block in msg.content:
                if hasattr(content_block, "text"):
                    content_text += content_block.text.value
            
            formatted_messages.append({
                "id": msg.id,
                "role": msg.role,
                "content": content_text,
                "created_at": msg.created_at if hasattr(msg, "created_at") else ""
            })
        
        # Reverse to get chronological order (API returns newest first)
        formatted_messages.reverse()
        
        return func.HttpResponse(
            json.dumps({
                "conversation_id": conversation_id,
                "thread_id": thread_id,
                "messages": formatted_messages
            }),
            mimetype="application/json",
            status_code=200
        )
    except ResourceNotFoundError:
        return func.HttpResponse(
            json.dumps({"error": "Conversation not found"}),
            mimetype="application/json",
            status_code=404
        )
    except Exception as e:
        logging.error(f"Error getting messages: {e}")
        return func.HttpResponse(
            json.dumps({"error": f"Failed to get messages: {str(e)}"}),
            mimetype="application/json",
            status_code=500
        )


def delete_conversation(user: dict, conversation_id: str) -> func.HttpResponse:
    """Delete a conversation."""
    try:
        table_client = get_table_client()
        table_client.delete_entity(partition_key=user["user_id"], row_key=conversation_id)
        
        return func.HttpResponse(
            json.dumps({"message": "Conversation deleted"}),
            mimetype="application/json",
            status_code=200
        )
    except Exception as e:
        logging.error(f"Error deleting conversation: {e}")
        return func.HttpResponse(
            json.dumps({"error": "Failed to delete conversation"}),
            mimetype="application/json",
            status_code=500
        )


# ============================================================
# /api/chat - Send message to agent
# ============================================================
@app.route(route="chat", methods=["POST"])
def chat(req: func.HttpRequest) -> func.HttpResponse:
    """Send a message to the AI agent and get a response."""
    user = get_user_id(req)
    
    try:
        body = req.get_json()
        message = body.get("message", "").strip()
        conversation_id = body.get("conversation_id")
        file_ids = body.get("file_ids", [])
        
        if not message and not file_ids:
            return func.HttpResponse(
                json.dumps({"error": "Message or file is required"}),
                mimetype="application/json",
                status_code=400
            )
        
        # Get or create conversation
        table_client = get_table_client()
        
        if conversation_id:
            try:
                entity = table_client.get_entity(partition_key=user["user_id"], row_key=conversation_id)
                thread_id = entity.get("thread_id")
            except ResourceNotFoundError:
                return func.HttpResponse(
                    json.dumps({"error": "Conversation not found"}),
                    mimetype="application/json",
                    status_code=404
                )
        else:
            # Create new conversation
            ai_client = get_ai_client()
            thread = ai_client.agents.create_thread()
            thread_id = thread.id
            conversation_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            
            entity = {
                "PartitionKey": user["user_id"],
                "RowKey": conversation_id,
                "thread_id": thread_id,
                "title": message[:50] if message else "File Upload",
                "created_at": now,
                "last_message_at": now,
                "preview": message[:100] if message else "File uploaded"
            }
            table_client.create_entity(entity)
        
        # Send message to agent
        ai_client = get_ai_client()
        
        # Build message with attachments
        attachments = []
        if file_ids:
            for file_id_info in file_ids:
                file_id = file_id_info.get("file_id") if isinstance(file_id_info, dict) else file_id_info
                file_type = file_id_info.get("file_type", "other") if isinstance(file_id_info, dict) else "other"
                
                # Determine tool based on file type
                if file_type in ["csv", "xlsx", "xls"]:
                    tools = [{"type": "code_interpreter"}]
                else:
                    tools = [{"type": "file_search"}]
                
                attachments.append({
                    "file_id": file_id,
                    "tools": tools
                })
        
        # Create message in thread
        message_content = message if message else "Please analyze the uploaded file."
        
        if attachments:
            ai_client.agents.create_message(
                thread_id=thread_id,
                role="user",
                content=message_content,
                attachments=attachments
            )
        else:
            ai_client.agents.create_message(
                thread_id=thread_id,
                role="user",
                content=message_content
            )
        
        # Run the agent
        run = ai_client.agents.create_and_process_run(
            thread_id=thread_id,
            assistant_id=AGENT_ID
        )
        
        # Check run status
        if run.status == "failed":
            error_msg = run.last_error.message if run.last_error else "Agent processing failed"
            logging.error(f"Agent run failed: {error_msg}")
            return func.HttpResponse(
                json.dumps({"error": f"Agent error: {error_msg}"}),
                mimetype="application/json",
                status_code=500
            )
        
        # Get the agent's response (latest message)
        messages = ai_client.agents.list_messages(thread_id=thread_id)
        
        agent_response = ""
        for msg in messages.data:
            if msg.role == "assistant":
                for content_block in msg.content:
                    if hasattr(content_block, "text"):
                        agent_response += content_block.text.value
                break  # Get only the latest assistant message
        
        # Update conversation metadata
        now = datetime.now(timezone.utc).isoformat()
        try:
            entity = table_client.get_entity(partition_key=user["user_id"], row_key=conversation_id)
            entity["last_message_at"] = now
            entity["preview"] = agent_response[:100] if agent_response else ""
            # Update title if it's still "New Conversation"
            if entity.get("title") == "New Conversation" and message:
                entity["title"] = message[:50]
            table_client.update_entity(entity, mode="merge")
        except Exception as e:
            logging.warning(f"Failed to update conversation metadata: {e}")
        
        return func.HttpResponse(
            json.dumps({
                "response": agent_response,
                "conversation_id": conversation_id,
                "thread_id": thread_id
            }),
            mimetype="application/json",
            status_code=200
        )
        
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON body"}),
            mimetype="application/json",
            status_code=400
        )
    except Exception as e:
        logging.error(f"Error in chat: {e}")
        return func.HttpResponse(
            json.dumps({"error": f"Failed to process message: {str(e)}"}),
            mimetype="application/json",
            status_code=500
        )


# ============================================================
# /api/upload - Upload file to Azure AI Foundry
# ============================================================
@app.route(route="upload", methods=["POST"])
def upload_file(req: func.HttpRequest) -> func.HttpResponse:
    """Upload a file to Azure AI Foundry for use with the agent."""
    user = get_user_id(req)
    
    try:
        # Get the file from the request
        file = req.files.get("file")
        
        if not file:
            return func.HttpResponse(
                json.dumps({"error": "No file provided"}),
                mimetype="application/json",
                status_code=400
            )
        
        filename = file.filename
        
        # Validate file type
        allowed_extensions = [".csv", ".xlsx", ".xls", ".docx", ".pdf"]
        file_ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        
        if file_ext not in allowed_extensions:
            return func.HttpResponse(
                json.dumps({"error": f"File type not supported. Allowed: {', '.join(allowed_extensions)}"}),
                mimetype="application/json",
                status_code=400
            )
        
        # Read file content
        file_content = file.read()
        
        # Validate file size (10MB limit)
        max_size = 10 * 1024 * 1024  # 10MB
        if len(file_content) > max_size:
            return func.HttpResponse(
                json.dumps({"error": "File size exceeds 10MB limit"}),
                mimetype="application/json",
                status_code=400
            )
        
        # Save temporarily and upload to Azure AI Foundry
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            tmp.write(file_content)
            tmp_path = tmp.name
        
        try:
            ai_client = get_ai_client()
            uploaded_file = ai_client.agents.upload_file_and_poll(
                file_path=tmp_path,
                purpose="agents"
            )
            
            # Determine file type category
            if file_ext in [".csv", ".xlsx", ".xls"]:
                file_type = file_ext.replace(".", "")
            elif file_ext == ".docx":
                file_type = "docx"
            elif file_ext == ".pdf":
                file_type = "pdf"
            else:
                file_type = "other"
            
            return func.HttpResponse(
                json.dumps({
                    "file_id": uploaded_file.id,
                    "filename": filename,
                    "file_type": file_type,
                    "size": len(file_content)
                }),
                mimetype="application/json",
                status_code=200
            )
        finally:
            # Clean up temp file
            import os as os_module
            try:
                os_module.unlink(tmp_path)
            except:
                pass
                
    except Exception as e:
        logging.error(f"Error uploading file: {e}")
        return func.HttpResponse(
            json.dumps({"error": f"Failed to upload file: {str(e)}"}),
            mimetype="application/json",
            status_code=500
        )


# ============================================================
# /api/health - Health check endpoint
# ============================================================
@app.route(route="health", methods=["GET"])
def health_check(req: func.HttpRequest) -> func.HttpResponse:
    """Health check endpoint."""
    return func.HttpResponse(
        json.dumps({"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}),
        mimetype="application/json",
        status_code=200
    )