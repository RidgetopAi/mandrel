import React, { useState, useEffect } from 'react';
import {
  Drawer, Typography, Space, Tag, Button, Descriptions, Card,
  Tabs, List, message, Spin, Input, Form, Select
} from 'antd';
import {
  EditOutlined, SaveOutlined, ShareAltOutlined,
  DeleteOutlined, TagsOutlined, CalendarOutlined, DatabaseOutlined,
  LinkOutlined, FolderOutlined, UserOutlined
} from '@ant-design/icons';
import { useContextStore } from '../../stores/contextStore';
import type { Context } from '../../types/context';
import {
  useDeleteContext,
  useRelatedContextsQuery,
  useUpdateContext,
} from '../../hooks/useContexts';
import {
  getTypeColor,
  getTypeDisplayName,
} from '../../utils/contextHelpers';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;

interface ContextDetailProps {
  visible: boolean;
  context: Context | null;
  onClose: () => void;
  onUpdate?: (context: Context) => void;
  onDelete?: (context: Context) => void;
}

const ContextDetail: React.FC<ContextDetailProps> = ({
  visible,
  context,
  onClose,
  onUpdate,
  onDelete
}) => {
  const { relatedContexts, setRelatedContexts, setCurrentContext } = useContextStore();
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();
  const updateContextMutation = useUpdateContext();
  const deleteContextMutation = useDeleteContext();
  const { data: relatedData, isFetching: loadingRelated } = useRelatedContextsQuery(context?.id, Boolean(visible && context));
  const updating = updateContextMutation.isPending;
  const deleting = deleteContextMutation.isPending;

  useEffect(() => {
    if (context) {
      form.setFieldsValue({
        content: context.content,
        tags: context.tags || [],
        relevance_score: context.relevance_score
      });
    }
  }, [context, form]);

  useEffect(() => {
    if (relatedData) {
      setRelatedContexts(relatedData as Context[]);
    } else {
      setRelatedContexts([]);
    }
  }, [relatedData, setRelatedContexts]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (context) {
      form.setFieldsValue({
        content: context.content,
        tags: context.tags || [],
        relevance_score: context.relevance_score
      });
    }
  };

  const handleSave = async () => {
    if (!context) return;

    try {
      const values = await form.validateFields();
      const updatedContext = await updateContextMutation.mutateAsync({
        id: context.id,
        updates: {
          content: values.content,
          tags: values.tags,
          relevance_score: values.relevance_score,
        },
      });

      setCurrentContext(updatedContext);
      onUpdate?.(updatedContext);
      setIsEditing(false);
      message.success('Context updated successfully');
    } catch (error) {
      console.error('Failed to update context:', error);
      message.error('Failed to update context');
    }
  };

  const handleDelete = async () => {
    if (!context) return;

    try {
      await deleteContextMutation.mutateAsync(context.id);
      onDelete?.(context);
      onClose();
      message.success('Context deleted successfully');
    } catch (error) {
      console.error('Failed to delete context:', error);
      message.error('Failed to delete context');
    }
  };

  const handleShare = () => {
    if (!context) return;
    
    const shareData = {
      title: `Context: ${context.type}`,
      text: `AIDIS Context\n\nType: ${getTypeDisplayName(context.type)}\nProject: ${context.project_name || 'Unknown'}\nCreated: ${dayjs(context.created_at).format('YYYY-MM-DD HH:mm')}\n\nContent:\n${context.content}`,
      url: window.location.href
    };

    if (navigator.share) {
      navigator.share(shareData);
    } else {
      navigator.clipboard.writeText(shareData.text);
      message.success('Context details copied to clipboard');
    }
  };

  const handleRelatedContextClick = (relatedContext: Context) => {
    setCurrentContext(relatedContext);
    // Update the form with the new context
    form.setFieldsValue({
      content: relatedContext.content,
      tags: relatedContext.tags || [],
      relevance_score: relatedContext.relevance_score
    });
    setIsEditing(false);
  };

  if (!context) return null;

  const typeColor = getTypeColor(context.type);
  const typeDisplayName = getTypeDisplayName(context.type);

  return (
    <Drawer
      title={
        <Space>
          <Tag color={typeColor}>{typeDisplayName}</Tag>
          <Text strong>Context Details</Text>
        </Space>
      }
      placement="right"
      width={720}
      onClose={onClose}
      open={visible}
      extra={
        <Space>
          <Button icon={<ShareAltOutlined />} onClick={handleShare}>
            Share
          </Button>
          {isEditing ? (
            <>
              <Button onClick={handleCancelEdit}>Cancel</Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={updating}
                disabled={updating}
              >
                Save
              </Button>
            </>
          ) : (
            <Button 
              type="primary" 
              icon={<EditOutlined />} 
              onClick={handleEdit}
            >
              Edit
            </Button>
          )}
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            loading={deleting}
            disabled={deleting}
          >
            Delete
          </Button>
        </Space>
      }
    >
      <Tabs defaultActiveKey="content">
        <TabPane tab="Content" key="content">
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Metadata */}
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={<><DatabaseOutlined /> ID</>}>
                <Text code>{context.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={<><FolderOutlined /> Project</>}>
                {context.project_name || 'Unknown'}
              </Descriptions.Item>
              <Descriptions.Item label={<><TagsOutlined /> Type</>}>
                <Tag color={typeColor}>{typeDisplayName}</Tag>
              </Descriptions.Item>
              {context.session_id && (
                <Descriptions.Item label={<><UserOutlined /> Session</>}>
                  <Text code>{context.session_id}</Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label={<><CalendarOutlined /> Created</>}>
                {dayjs(context.created_at).format('YYYY-MM-DD HH:mm:ss')}
                <Text type="secondary"> ({dayjs.utc(context.created_at).local().fromNow()})</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Last Updated">
                {dayjs(context.updated_at).format('YYYY-MM-DD HH:mm:ss')}
                <Text type="secondary"> ({dayjs.utc(context.updated_at).local().fromNow()})</Text>
              </Descriptions.Item>
            </Descriptions>

            {/* Editable Content */}
            <Card title="Content" size="small">
              {isEditing ? (
                <Form form={form} layout="vertical">
                  <Form.Item 
                    name="content" 
                    rules={[{ required: true, message: 'Content is required' }]}
                  >
                    <TextArea 
                      rows={12}
                      placeholder="Enter context content..."
                    />
                  </Form.Item>
                </Form>
              ) : (
                <Paragraph
                  style={{ 
                    whiteSpace: 'pre-wrap', 
                    maxHeight: '400px', 
                    overflowY: 'auto' 
                  }}
                >
                  {context.content}
                </Paragraph>
              )}
            </Card>

            {/* Tags */}
            <Card title="Tags & Metadata" size="small">
              {isEditing ? (
                <Form form={form} layout="vertical">
                  <Form.Item name="tags" label="Tags">
                    <Select
                      mode="tags"
                      style={{ width: '100%' }}
                      placeholder="Enter tags..."
                      tokenSeparators={[',']}
                    />
                  </Form.Item>
                  <Form.Item 
                    name="relevance_score" 
                    label="Relevance Score (0-10)"
                  >
                    <Input 
                      type="number" 
                      min={0} 
                      max={10} 
                      step={0.1}
                      placeholder="Enter relevance score..."
                    />
                  </Form.Item>
                </Form>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {context.tags && context.tags.length > 0 ? (
                    <Space wrap>
                      {context.tags.map(tag => (
                        <Tag key={tag} color="processing">
                          {tag}
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Text type="secondary">No tags</Text>
                  )}
                  
                  {context.relevance_score && (
                    <div>
                      <Text strong>Relevance Score: </Text>
                      <Tag color="gold">{context.relevance_score.toFixed(2)}</Tag>
                    </div>
                  )}
                </Space>
              )}
            </Card>
          </Space>
        </TabPane>

        <TabPane tab="Related Contexts" key="related">
          <Spin spinning={loadingRelated}>
            {relatedContexts.length > 0 ? (
              <List
                dataSource={relatedContexts}
                renderItem={(relatedContext) => (
                  <List.Item
                    actions={[
                      <Button 
                        type="link" 
                        icon={<LinkOutlined />}
                        onClick={() => handleRelatedContextClick(relatedContext)}
                      >
                        View
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color={getTypeColor(relatedContext.type)}>
                            {getTypeDisplayName(relatedContext.type)}
                          </Tag>
                          <Text>{relatedContext.project_name}</Text>
                        </Space>
                      }
                      description={
                        <div>
                          <Paragraph ellipsis={{ rows: 2 }}>
                            {relatedContext.content}
                          </Paragraph>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {dayjs.utc(relatedContext.created_at).local().fromNow()}
                          </Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Card>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Text type="secondary">No related contexts found</Text>
                </div>
              </Card>
            )}
          </Spin>
        </TabPane>

        <TabPane tab="Raw Data" key="raw">
          <Card>
            <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(context, null, 2)}
            </pre>
          </Card>
        </TabPane>
      </Tabs>
    </Drawer>
  );
};

export default ContextDetail;
